#!/usr/bin/env python3
"""ASR evaluation framework — main script.

Runs ASR models against ground-truth Quran alignments and computes
WER, CER, detection accuracy, and latency metrics.

Usage:
    uv run python eval_asr.py --model tarteel-base --eval-set short
    uv run python eval_asr.py --model whisper-small --eval-set core --sample-ayahs 50
    uv run python eval_asr.py --model-path ./my-finetuned --backend transformers --eval-set short
    uv run python eval_asr.py --compare  # compare all existing reports
"""

import argparse
import json
import logging
import random
import sys
import time
from pathlib import Path
from statistics import mean, median
from typing import Any

import numpy as np
import soundfile as sf
from jiwer import cer, wer

from eval_config import (
    CACHE_WAV_DIR,
    EVAL_SETS,
    MODELS,
    OUTPUT_DIR,
    ModelConfig,
    normalize_arabic,
    normalize_for_wer,
    normalize_words,
)
from eval_detection import word_similarity
from eval_report import print_comparison_table, print_summary, save_report

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("eval_asr")

SAMPLE_RATE = 16000
RANDOM_SEED = 42


# ─── Unified ASR wrapper ─────────────────────────────────────


class EvalASR:
    """Unified ASR model wrapper for evaluation.

    Supports both HuggingFace transformers and faster-whisper backends.
    """

    def __init__(self, config: ModelConfig):
        self.config = config
        self._model = None
        self._processor = None
        self._device = None
        self._fw_model = None  # faster_whisper model

    def _load(self):
        if self.config.backend == "transformers":
            self._load_transformers()
        elif self.config.backend == "faster_whisper":
            self._load_faster_whisper()
        else:
            raise ValueError(f"Unknown backend: {self.config.backend}")

    def _load_transformers(self):
        if self._model is not None:
            return
        import torch
        from transformers import WhisperForConditionalGeneration, WhisperProcessor

        logger.info(f"Loading model: {self.config.model_id} (transformers)")
        self._processor = WhisperProcessor.from_pretrained(self.config.model_id)
        self._model = WhisperForConditionalGeneration.from_pretrained(
            self.config.model_id
        )
        self._device = "cuda" if torch.cuda.is_available() else "cpu"
        self._model.to(self._device)

        # For non-tarteel models, force Arabic transcription.
        # Community fine-tunes often have broken generation configs
        # (missing lang_to_id, max_length, etc.). We patch essential
        # fields and use forced_decoder_ids as the most reliable method.
        if not self.config.model_id.startswith("tarteel"):
            gc = self._model.generation_config
            gc.forced_decoder_ids = self._processor.get_decoder_prompt_ids(
                language=self.config.language, task=self.config.task
            )
            if gc.max_length is None:
                gc.max_length = 448

        logger.info(f"Model loaded on {self._device}")

    def _load_faster_whisper(self):
        if self._fw_model is not None:
            return
        from faster_whisper import WhisperModel

        logger.info(
            f"Loading model: {self.config.model_id} (faster_whisper, {self.config.compute_type})"
        )
        self._fw_model = WhisperModel(
            self.config.model_id, compute_type=self.config.compute_type
        )
        logger.info("Model loaded")

    def transcribe(self, audio: np.ndarray, sr: int = SAMPLE_RATE) -> str:
        """Transcribe audio to text."""
        self._load()

        if self.config.backend == "transformers":
            return self._transcribe_transformers(audio, sr)
        else:
            return self._transcribe_faster_whisper(audio, sr)

    def _transcribe_transformers(self, audio: np.ndarray, sr: int) -> str:
        import torch

        inputs = self._processor(audio, sampling_rate=sr, return_tensors="pt")
        input_features = inputs.input_features.to(self._device)

        with torch.no_grad():
            predicted_ids = self._model.generate(input_features)

        text = self._processor.batch_decode(
            predicted_ids, skip_special_tokens=True
        )[0]
        return text.strip()

    def _transcribe_faster_whisper(self, audio: np.ndarray, sr: int) -> str:
        segments, _ = self._fw_model.transcribe(
            audio,
            language=self.config.language,
            task=self.config.task,
        )
        return " ".join(s.text.strip() for s in segments)


# ─── Audio extraction ─────────────────────────────────────────


def load_audio(wav_path: Path, sr: int = SAMPLE_RATE) -> np.ndarray:
    """Load audio file, resampling to target sr if needed."""
    audio, file_sr = sf.read(wav_path, dtype="float32")
    if file_sr != sr:
        import librosa

        audio = librosa.resample(audio, orig_sr=file_sr, target_sr=sr)
    # Mono
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    return audio


def extract_segment(
    audio: np.ndarray, start: float, end: float, sr: int = SAMPLE_RATE
) -> np.ndarray:
    """Extract audio segment by time range."""
    s = max(0, int(start * sr))
    e = min(len(audio), int(end * sr))
    return audio[s:e]


# ─── Ground truth loading ─────────────────────────────────────


def load_ground_truth(surah_no: int) -> dict[str, Any] | None:
    """Load alignment ground truth for a surah."""
    path = OUTPUT_DIR / f"{surah_no:03d}_timings.json"
    if not path.exists():
        logger.warning(f"No ground truth for surah {surah_no}: {path}")
        return None
    return json.loads(path.read_text())


# ─── Match rate simulation ────────────────────────────────────
#
# Simulates src/services/recitationMatcherService.ts matchChunk().
# This is the metric that actually matters for the app — does the
# ASR output match well enough to advance the word pointer?

_MATCH_MIN_SIMILARITY = 0.40  # MIN_WORD_SIMILARITY in TS
_MATCH_SEARCH_WINDOW = 8      # SEARCH_WINDOW in TS


def _simulate_match(hyp_words: list[str], ref_words: list[str]) -> int:
    """Simulate matchChunk: count how many ref words get matched.

    Uses the same algorithm as the app: for each ASR word, search a
    window of upcoming ref words for the best Levenshtein match >= 40%.
    Skipped ref words count as unmatched.

    Returns the number of ref words successfully matched.
    """
    pointer = 0
    matched = 0

    for hyp_word in hyp_words:
        if pointer >= len(ref_words):
            break

        window_end = min(len(ref_words), pointer + _MATCH_SEARCH_WINDOW)
        best_sim = 0.0
        best_idx = -1

        for i in range(pointer, window_end):
            sim = word_similarity(hyp_word, ref_words[i])
            if sim > best_sim:
                best_sim = sim
                best_idx = i

        if best_idx >= 0 and best_sim >= _MATCH_MIN_SIMILARITY:
            matched += 1  # The matched word itself
            pointer = best_idx + 1

    return matched


# ─── WER/CER evaluation ──────────────────────────────────────


def evaluate_surah_wer(
    asr: EvalASR,
    surah_no: int,
    audio: np.ndarray,
    gt: dict[str, Any],
    sample_ayahs: int | None = None,
) -> dict[str, Any]:
    """Evaluate WER/CER for a single surah.

    Returns per-ayah and aggregate metrics.
    """
    ayahs = gt["ayahs"]
    name = gt.get("surah_name_en", f"Surah {surah_no}")

    # Sample if needed (long surahs)
    if sample_ayahs and len(ayahs) > sample_ayahs:
        rng = random.Random(RANDOM_SEED + surah_no)
        ayahs = rng.sample(ayahs, sample_ayahs)
        logger.info(f"  Sampling {sample_ayahs}/{len(gt['ayahs'])} ayahs")

    wer_scores = []
    cer_scores = []
    match_rates = []
    rtf_values = []
    per_ayah = []

    for ayah in ayahs:
        ayah_no = ayah["aya_no"]
        start = ayah["start_time"]
        end = ayah["end_time"]
        duration = end - start

        if duration < 0.3:
            # Skip ultra-short segments (likely alignment artifacts)
            continue

        segment = extract_segment(audio, start, end)
        if len(segment) < SAMPLE_RATE * 0.3:
            continue

        # Transcribe
        t0 = time.monotonic()
        hypothesis = asr.transcribe(segment)
        elapsed = time.monotonic() - t0

        # Normalize both sides — Qalun normalization collapses orthographic
        # differences so WER measures actual recognition errors
        ref_text = normalize_for_wer(ayah["aya_text"])
        hyp_text = normalize_for_wer(hypothesis)

        # Skip empty
        if not ref_text.strip() or not hyp_text.strip():
            continue

        # Compute WER/CER
        try:
            ayah_wer = wer(ref_text, hyp_text)
            ayah_cer = cer(ref_text, hyp_text)
        except Exception:
            continue

        # Compute match rate — simulates the real app pipeline.
        # Uses normalize_arabic only (no Qalun normalization) with the same
        # 40% Levenshtein threshold and 8-word search window as
        # recitationMatcherService.ts matchChunk()
        app_ref_words = normalize_arabic(ayah["aya_text"]).split()
        app_hyp_words = normalize_arabic(hypothesis).split()
        matched_words = _simulate_match(app_hyp_words, app_ref_words)
        ayah_match_rate = matched_words / max(len(app_ref_words), 1)

        rtf = elapsed / duration if duration > 0 else 0

        wer_scores.append(ayah_wer)
        cer_scores.append(ayah_cer)
        match_rates.append(ayah_match_rate)
        rtf_values.append(rtf)

        per_ayah.append({
            "ayah": ayah_no,
            "wer": round(ayah_wer, 4),
            "cer": round(ayah_cer, 4),
            "match_rate": round(ayah_match_rate, 4),
            "ref": ref_text,
            "hyp": hyp_text,
            "duration": round(duration, 2),
            "rtf": round(rtf, 3),
        })

    if not wer_scores:
        return {"name": name, "ayah_count": len(gt["ayahs"]), "error": "no valid ayahs"}

    return {
        "name": name,
        "ayah_count": len(gt["ayahs"]),
        "evaluated_ayahs": len(wer_scores),
        "wer": round(mean(wer_scores), 4),
        "wer_median": round(median(wer_scores), 4),
        "cer": round(mean(cer_scores), 4),
        "cer_median": round(median(cer_scores), 4),
        "match_rate": round(mean(match_rates), 4),
        "match_rate_median": round(median(match_rates), 4),
        "rtf": round(mean(rtf_values), 3),
        "per_ayah": per_ayah,
    }


# ─── Detection evaluation ────────────────────────────────────


def evaluate_surah_detection(
    asr: EvalASR,
    surah_no: int,
    audio: np.ndarray,
    gt: dict[str, Any],
    clip_durations: list[int] = [5, 10, 15],
) -> dict[str, dict[str, float]]:
    """Evaluate detection accuracy using simulated clips.

    Extracts clips at 0%, 25%, 50%, 75% through the surah,
    runs ASR, then checks if findTopCandidates returns the correct surah.
    """
    try:
        from eval_detection import QuranDetectionIndex
    except ImportError:
        logger.warning("eval_detection.py not found, skipping detection eval")
        return {}

    detector = QuranDetectionIndex.get_instance()
    ayahs = gt["ayahs"]
    if not ayahs:
        return {}

    # Sample positions at 0%, 25%, 50%, 75% through the surah
    positions = [0, len(ayahs) // 4, len(ayahs) // 2, 3 * len(ayahs) // 4]
    positions = [min(p, len(ayahs) - 1) for p in positions]

    results: dict[str, dict[str, list[bool]]] = {
        f"{d}s": {"top1": [], "top3": []} for d in clip_durations
    }

    for pos_idx in positions:
        ayah = ayahs[pos_idx]
        clip_start = ayah["start_time"]

        for dur in clip_durations:
            clip_end = clip_start + dur
            segment = extract_segment(audio, clip_start, clip_end)

            if len(segment) < SAMPLE_RATE * 1.0:
                continue

            hypothesis = asr.transcribe(segment)
            asr_words = normalize_words(hypothesis)

            if len(asr_words) < 3:
                continue

            candidates = detector.find_top_candidates(asr_words, max_candidates=3)

            top1_hit = len(candidates) > 0 and candidates[0]["surah"] == surah_no
            top3_hit = any(c["surah"] == surah_no for c in candidates)

            results[f"{dur}s"]["top1"].append(top1_hit)
            results[f"{dur}s"]["top3"].append(top3_hit)

    # Aggregate
    aggregated: dict[str, dict[str, float]] = {}
    for dur_key, hits in results.items():
        if hits["top1"]:
            aggregated[dur_key] = {
                "top1": round(sum(hits["top1"]) / len(hits["top1"]), 4),
                "top3": round(sum(hits["top3"]) / len(hits["top3"]), 4),
                "n": len(hits["top1"]),
            }

    return aggregated


# ─── Main orchestrator ────────────────────────────────────────


def run_evaluation(
    config: ModelConfig,
    eval_set: str,
    sample_ayahs: int | None = None,
    skip_detection: bool = False,
) -> dict[str, Any]:
    """Run full evaluation for a model on an eval set."""
    surah_list = EVAL_SETS.get(eval_set)
    if not surah_list:
        raise ValueError(f"Unknown eval set: {eval_set}. Available: {list(EVAL_SETS)}")

    logger.info(f"Evaluating {config.name} on {eval_set} set ({len(surah_list)} surahs)")

    asr = EvalASR(config)

    per_surah: dict[str, Any] = {}
    all_wer = []
    all_cer = []
    all_match_rate = []
    all_rtf = []
    all_detection: dict[str, dict[str, list[bool]]] = {}

    for surah_no in surah_list:
        logger.info(f"Surah {surah_no}...")

        # Load ground truth
        gt = load_ground_truth(surah_no)
        if gt is None:
            continue

        # Load audio
        wav_path = CACHE_WAV_DIR / f"{surah_no:03d}.wav"
        if not wav_path.exists():
            logger.warning(f"  No audio file: {wav_path}")
            continue

        audio = load_audio(wav_path)
        logger.info(
            f"  {gt.get('surah_name_en', '?')}: {len(gt['ayahs'])} ayahs, "
            f"{len(audio) / SAMPLE_RATE:.0f}s audio"
        )

        # WER/CER evaluation
        surah_result = evaluate_surah_wer(asr, surah_no, audio, gt, sample_ayahs)
        per_surah[str(surah_no)] = surah_result

        if "wer" in surah_result:
            all_wer.append(surah_result["wer"])
            all_cer.append(surah_result["cer"])
            all_match_rate.append(surah_result["match_rate"])
            all_rtf.append(surah_result["rtf"])
            logger.info(
                f"  WER={surah_result['wer']:.1%} CER={surah_result['cer']:.1%} "
                f"Match={surah_result['match_rate']:.1%} "
                f"RTF={surah_result['rtf']:.2f}x "
                f"({surah_result['evaluated_ayahs']} ayahs)"
            )

        # Detection evaluation
        if not skip_detection:
            det_results = evaluate_surah_detection(asr, surah_no, audio, gt)
            if det_results:
                surah_result["detection"] = det_results
                for dur_key, hits in det_results.items():
                    if dur_key not in all_detection:
                        all_detection[dur_key] = {"top1": [], "top3": []}
                    all_detection[dur_key]["top1"].append(hits["top1"])
                    all_detection[dur_key]["top3"].append(hits["top3"])

    # Aggregate
    aggregate: dict[str, Any] = {}
    if all_wer:
        aggregate["wer_mean"] = round(mean(all_wer), 4)
        aggregate["wer_median"] = round(median(all_wer), 4)
        aggregate["cer_mean"] = round(mean(all_cer), 4)
        aggregate["cer_median"] = round(median(all_cer), 4)
        aggregate["match_rate_mean"] = round(mean(all_match_rate), 4)
        aggregate["match_rate_median"] = round(median(all_match_rate), 4)
        aggregate["rtf_mean"] = round(mean(all_rtf), 3)

    if all_detection:
        aggregate["detection"] = {}
        for dur_key, scores in all_detection.items():
            if scores["top1"]:
                aggregate["detection"][dur_key] = {
                    "top1": round(mean(scores["top1"]), 4),
                    "top3": round(mean(scores["top3"]), 4),
                }

    return {"per_surah": per_surah, "aggregate": aggregate}


# ─── CLI ──────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(
        description="Evaluate ASR models on Quran recitation"
    )
    parser.add_argument(
        "--model",
        choices=list(MODELS.keys()),
        help=f"Model from registry: {list(MODELS.keys())}",
    )
    parser.add_argument(
        "--model-path",
        help="Custom model path (HuggingFace ID or local)",
    )
    parser.add_argument(
        "--backend",
        choices=["transformers", "faster_whisper"],
        default="transformers",
        help="ASR backend (default: transformers)",
    )
    parser.add_argument(
        "--compute-type",
        default="float32",
        help="Compute type for faster_whisper (default: float32)",
    )
    parser.add_argument(
        "--eval-set",
        default="short",
        choices=list(EVAL_SETS.keys()),
        help=f"Eval set (default: short). Available: {list(EVAL_SETS.keys())}",
    )
    parser.add_argument(
        "--sample-ayahs",
        type=int,
        default=None,
        help="Max ayahs per surah (samples randomly if surah has more)",
    )
    parser.add_argument(
        "--skip-detection",
        action="store_true",
        help="Skip detection accuracy evaluation",
    )
    parser.add_argument(
        "--compare",
        action="store_true",
        help="Compare all existing reports (don't run evaluation)",
    )

    args = parser.parse_args()

    if args.compare:
        print_comparison_table()
        return

    # Resolve model config
    if args.model:
        config = MODELS[args.model]
    elif args.model_path:
        config = ModelConfig(
            name=Path(args.model_path).name,
            model_id=args.model_path,
            backend=args.backend,
            compute_type=args.compute_type,
        )
    else:
        parser.error("Provide --model or --model-path")
        return

    # Run evaluation
    results = run_evaluation(
        config,
        args.eval_set,
        sample_ayahs=args.sample_ayahs,
        skip_detection=args.skip_detection,
    )

    # Output
    print_summary(results, config.name)
    save_report(results, config.name, args.eval_set)


if __name__ == "__main__":
    main()
