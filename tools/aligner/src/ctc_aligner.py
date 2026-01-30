"""CTC forced alignment using torchaudio and wav2vec2 Arabic model."""

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from pyarabic import trans

from .text_cleaner import (
    TextCleaner,
    expand_muqattaat,
    get_muqattaat_expected_duration,
    is_muqattaat_word,
    MUQATTAAT_LETTER_DURATION,
)

logger = logging.getLogger(__name__)


def romanize_arabic(text: str) -> str:
    """Romanize Arabic text using pyarabic."""
    try:
        return trans.utf82tim(text)
    except Exception:
        return text


class CTCAligner:
    """CTC forced alignment for Arabic Quran audio using torchaudio."""

    MODEL_ID = "jonatasgrosman/wav2vec2-large-xlsr-53-arabic"
    SAMPLE_RATE = 16000

    # Isti'adha + Basmala offset in seconds
    # أعوذ بالله من الشيطان الرجيم + بسم الله الرحمن الرحيم
    # Al-Fatiha specifically has both before the first ayah
    DEFAULT_ISTIIADHA_OFFSET = 11.0

    # Surah-specific offsets (some surahs have different intro lengths)
    # Most surahs: isti'adha (~3.5s) + basmala (~2s) = ~5.5s
    SURAH_OFFSETS = {
        1: 11.0,   # Al-Fatiha: longer isti'adha + basmala (basmala not counted as ayah)
        2: 5.0,    # Al-Baqarah: isti'adha + basmala
        9: 3.5,    # At-Tawbah: no basmala, just isti'adha
    }
    DEFAULT_ISTIIADHA_OFFSET = 5.5  # Default for most surahs

    def __init__(
        self,
        device: Optional[str] = None,
        romanize: bool = True,
        istiiadha_offset: Optional[float] = None,
    ):
        """
        Initialize CTC aligner.

        Args:
            device: 'cuda' or 'cpu'. Auto-detects if None.
            romanize: Whether to romanize Arabic text for alignment.
            istiiadha_offset: Seconds to skip at start. None = auto per surah.
        """
        self.device = device
        self.romanize = romanize
        self._custom_offset = istiiadha_offset  # None means use per-surah defaults
        self._model = None
        self._labels = None
        self._dictionary = None
        self.text_cleaner = TextCleaner()

    def get_offset_for_surah(self, surah_no: int) -> float:
        """Get the appropriate offset for a specific surah."""
        if self._custom_offset is not None:
            return self._custom_offset
        return self.SURAH_OFFSETS.get(surah_no, self.DEFAULT_ISTIIADHA_OFFSET)

    def _get_device(self) -> str:
        """Determine device to use."""
        if self.device:
            return self.device

        try:
            import torch

            if torch.cuda.is_available():
                return "cuda"
        except ImportError:
            pass

        return "cpu"

    def _load_model(self):
        """Lazy load model using torchaudio's wav2vec2 pipeline."""
        if self._model is not None:
            return

        try:
            import torch
            import torchaudio
            from torchaudio.pipelines import MMS_FA as bundle

            self._torch = torch
            self._torchaudio = torchaudio

        except ImportError as e:
            raise ImportError(
                f"Required packages not installed: {e}. "
                "Run: uv sync --extra cuda (or --extra cpu)"
            )

        device = self._get_device()
        logger.info(f"Loading MMS forced alignment model on {device}...")

        try:
            # Use MMS (Massively Multilingual Speech) forced alignment
            # which supports Arabic out of the box
            self._model = bundle.get_model().to(device)
            self._labels = bundle.get_labels()
            self._dictionary = bundle.get_dict()
            self._sample_rate = bundle.sample_rate

            # Set model to eval mode
            self._model.eval()

            logger.info("Model loaded successfully")

        except RuntimeError as e:
            if "CUDA out of memory" in str(e) and device == "cuda":
                logger.warning("CUDA OOM, falling back to CPU...")
                self.device = "cpu"
                self._load_model()
            else:
                raise

    def _compute_alignments(
        self,
        waveform: "torch.Tensor",
        transcript: List[str],
        original_words: List[str],
    ) -> List[Tuple[float, float, str]]:
        """
        Compute word-level alignments using torchaudio forced alignment.

        Args:
            waveform: Audio tensor (1, samples) at model sample rate
            transcript: List of words to align (possibly romanized)
            original_words: Original Arabic words (for output)

        Returns:
            List of (start_time, end_time, word) tuples
        """
        import torchaudio.functional as F

        device = self._get_device()
        waveform = waveform.to(device)

        # Get emission probabilities
        with self._torch.inference_mode():
            emission, _ = self._model(waveform)

        # Tokenize transcript
        # MMS uses character-level alignment
        tokens = []
        word_boundaries = [0]

        for word in transcript:
            word_tokens = []
            for char in word:
                if char in self._dictionary:
                    word_tokens.append(self._dictionary[char])
                elif char.lower() in self._dictionary:
                    word_tokens.append(self._dictionary[char.lower()])
                # Skip characters not in dictionary
            tokens.extend(word_tokens)
            word_boundaries.append(len(tokens))

        if not tokens:
            logger.warning("No tokens generated from transcript")
            return []

        tokens_tensor = self._torch.tensor([tokens], dtype=self._torch.int32, device=device)

        # Forced alignment using CTC
        try:
            aligned_tokens, scores = F.forced_align(
                emission,
                tokens_tensor,
                blank=0,
            )
        except Exception as e:
            logger.warning(f"Forced alignment failed: {e}")
            return []

        # Convert token alignments to word alignments
        aligned_tokens = aligned_tokens[0].cpu().tolist()
        num_frames = emission.shape[1]
        duration = waveform.shape[1] / self._sample_rate

        # Calculate frame duration
        frame_duration = duration / num_frames

        # Find frame positions for each token (non-blank)
        token_to_frame = []
        for frame_idx, token_id in enumerate(aligned_tokens):
            if token_id != 0:
                token_to_frame.append(frame_idx)

        # Group by word boundaries
        alignments = []
        for i, orig_word in enumerate(original_words):
            start_token_idx = word_boundaries[i]
            end_token_idx = word_boundaries[i + 1]

            if start_token_idx >= end_token_idx:
                continue
            if start_token_idx >= len(token_to_frame):
                continue

            # Get frames for this word
            end_idx = min(end_token_idx, len(token_to_frame))
            word_frames = token_to_frame[start_token_idx:end_idx]

            if word_frames:
                start_time = min(word_frames) * frame_duration
                end_time = (max(word_frames) + 1) * frame_duration
                alignments.append((start_time, end_time, orig_word))

        return alignments

    def _simple_alignment(
        self,
        audio: np.ndarray,
        words: List[str],
        sample_rate: int,
    ) -> List[Dict[str, Any]]:
        """
        Simple uniform distribution alignment as fallback.

        Distributes words evenly across the audio duration.
        """
        if not words:
            return []

        duration = len(audio) / sample_rate
        word_duration = duration / len(words)

        timings = []
        for i, word in enumerate(words):
            start = i * word_duration
            end = (i + 1) * word_duration
            timings.append({
                "word": word,
                "start": round(start, 3),
                "end": round(end, 3),
            })

        return timings

    def align_audio(
        self,
        audio: np.ndarray,
        text: str,
        sample_rate: int = 16000,
    ) -> List[Dict[str, Any]]:
        """
        Align audio with text using CTC forced alignment.

        Args:
            audio: Audio waveform as numpy array
            text: Text to align
            sample_rate: Audio sample rate

        Returns:
            List of word timings with start/end times
        """
        # Clean text and get words
        original_words = self.text_cleaner.split_words(text)
        if not original_words:
            return []

        # Romanize if enabled
        if self.romanize:
            transcript_words = [romanize_arabic(w) for w in original_words]
        else:
            transcript_words = original_words

        try:
            self._load_model()

            # Convert to tensor and resample if needed
            waveform = self._torch.from_numpy(audio).float().unsqueeze(0)

            if sample_rate != self._sample_rate:
                waveform = self._torchaudio.functional.resample(
                    waveform, sample_rate, self._sample_rate
                )

            # Compute alignments
            alignments = self._compute_alignments(waveform, transcript_words, original_words)

            if alignments:
                return [
                    {
                        "word": word,
                        "start": round(start, 3),
                        "end": round(end, 3),
                    }
                    for start, end, word in alignments
                ]

        except Exception as e:
            logger.warning(f"Alignment failed, using uniform distribution: {e}")

        # Fallback to simple uniform distribution
        return self._simple_alignment(audio, original_words, sample_rate)

    def align_ayahs(
        self,
        audio: np.ndarray,
        ayahs: List[Dict[str, Any]],
        sample_rate: int = 16000,
        surah_no: int = 1,
        skip_istiiadha: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        Align full surah audio with ayahs using full-audio alignment.

        Args:
            audio: Full surah audio waveform
            ayahs: List of ayah dicts with 'aya_text' field
            sample_rate: Audio sample rate
            surah_no: Surah number (for offset calculation)
            skip_istiiadha: Skip initial isti'adha portion

        Returns:
            List of ayahs with added timing information
        """
        self._load_model()

        total_duration = len(audio) / sample_rate

        # Handle isti'adha offset (surah-specific)
        offset_samples = 0
        offset_time = 0.0

        if skip_istiiadha:
            offset_time = self.get_offset_for_surah(surah_no)
            if offset_time > 0:
                offset_samples = int(offset_time * sample_rate)
                if offset_samples >= len(audio):
                    logger.warning("Isti'adha offset exceeds audio length, ignoring")
                    offset_samples = 0
                    offset_time = 0.0
                else:
                    logger.info(f"Using isti'adha offset: {offset_time:.1f}s for surah {surah_no}")

        # Audio after isti'adha
        audio_for_alignment = audio[offset_samples:]

        # Combine all ayah texts for full alignment
        all_original_words = []
        word_to_ayah = []  # Track which ayah each word belongs to

        for ayah_idx, ayah in enumerate(ayahs):
            aya_text = ayah["aya_text"]

            # Expand Muqatta'at for first ayah only (they appear at start of affected surahs)
            # This gives CTC aligner enough token slots for the long pronunciation
            if ayah_idx == 0:
                expanded_text = expand_muqattaat(aya_text)
                if expanded_text != aya_text:
                    logger.info(f"Expanded Muqatta'at: {aya_text[:20]}... -> {expanded_text[:30]}...")
                    aya_text = expanded_text

            words = self.text_cleaner.split_words(aya_text)
            all_original_words.extend(words)
            word_to_ayah.extend([ayah_idx] * len(words))

        if not all_original_words:
            logger.warning("No words found in ayahs")
            return ayahs

        # Romanize if enabled
        if self.romanize:
            transcript_words = [romanize_arabic(w) for w in all_original_words]
        else:
            transcript_words = all_original_words

        # Convert to tensor
        waveform = self._torch.from_numpy(audio_for_alignment).float().unsqueeze(0)

        # Align full audio
        try:
            alignments = self._compute_alignments(waveform, transcript_words, all_original_words)
        except Exception as e:
            logger.warning(f"Full alignment failed: {e}")
            alignments = []

        # Build word timings with offset
        all_word_timings = []
        if alignments:
            for start, end, word in alignments:
                all_word_timings.append({
                    "word": word,
                    "start": round(start + offset_time, 3),
                    "end": round(end + offset_time, 3),
                })
        else:
            # Fallback to uniform distribution
            effective_duration = total_duration - offset_time
            word_duration = effective_duration / len(all_original_words)
            for i, word in enumerate(all_original_words):
                all_word_timings.append({
                    "word": word,
                    "start": round(offset_time + i * word_duration, 3),
                    "end": round(offset_time + (i + 1) * word_duration, 3),
                })

        # Segment word timings by ayah
        aligned_ayahs = []
        word_idx = 0

        for ayah_idx, ayah in enumerate(ayahs):
            aya_text = ayah["aya_text"]

            # Apply same Muqatta'at expansion as above to match word counts
            if ayah_idx == 0:
                aya_text = expand_muqattaat(aya_text)

            words = self.text_cleaner.split_words(aya_text)
            num_words = len(words)

            ayah_word_timings = []
            for _ in range(num_words):
                if word_idx < len(all_word_timings):
                    ayah_word_timings.append(all_word_timings[word_idx])
                    word_idx += 1

            if ayah_word_timings:
                start_time = ayah_word_timings[0]["start"]
                end_time = ayah_word_timings[-1]["end"]
            else:
                start_time = offset_time
                end_time = offset_time

            aligned_ayahs.append({
                **ayah,
                "start_time": round(start_time, 3),
                "end_time": round(end_time, 3),
                "word_timings": ayah_word_timings,
            })

        # Post-process: adjust Muqatta'at timings based on expected Madd Lazem duration
        aligned_ayahs = self._adjust_muqattaat_timings(aligned_ayahs, ayahs)

        return aligned_ayahs

    def _adjust_muqattaat_timings(
        self,
        aligned_ayahs: List[Dict[str, Any]],
        original_ayahs: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """
        Adjust Muqatta'at word timings based on expected Madd Lazem duration.

        The CTC aligner doesn't understand Quranic elongation (Madd Lazem),
        so we scale Muqatta'at timings to match expected duration.

        Args:
            aligned_ayahs: Aligned ayahs with word timings
            original_ayahs: Original ayah data (to check for Muqatta'at)

        Returns:
            Adjusted aligned ayahs
        """
        if not aligned_ayahs or not original_ayahs:
            return aligned_ayahs

        # Check if first ayah has Muqatta'at
        first_ayah_text = original_ayahs[0].get("aya_text", "")
        expected_duration = get_muqattaat_expected_duration(first_ayah_text)

        if expected_duration <= 0:
            return aligned_ayahs  # No Muqatta'at to adjust

        first_aligned = aligned_ayahs[0]
        word_timings = first_aligned.get("word_timings", [])

        if not word_timings:
            return aligned_ayahs

        # Find Muqatta'at words (they're the expanded elongated words at start)
        muqattaat_words = []
        muqattaat_end_idx = 0

        for i, wt in enumerate(word_timings):
            if is_muqattaat_word(wt["word"]):
                muqattaat_words.append(wt)
                muqattaat_end_idx = i + 1
            else:
                break  # Stop at first non-Muqatta'at word

        if not muqattaat_words:
            return aligned_ayahs

        # Calculate current vs expected duration
        current_start = muqattaat_words[0]["start"]
        current_end = muqattaat_words[-1]["end"]
        current_duration = current_end - current_start

        if current_duration <= 0:
            return aligned_ayahs

        # Time shift needed
        time_shift = expected_duration - current_duration

        if abs(time_shift) < 0.1:
            return aligned_ayahs  # Already close enough

        logger.info(
            f"Adjusting Muqatta'at timing: {current_duration:.2f}s -> {expected_duration:.2f}s "
            f"(shift: +{time_shift:.2f}s)"
        )

        # Scale Muqatta'at word timings proportionally
        scale_factor = expected_duration / current_duration

        for wt in muqattaat_words:
            # Scale relative to start
            rel_start = wt["start"] - current_start
            rel_end = wt["end"] - current_start
            wt["start"] = round(current_start + rel_start * scale_factor, 3)
            wt["end"] = round(current_start + rel_end * scale_factor, 3)

        new_muqattaat_end = muqattaat_words[-1]["end"]
        original_muqattaat_end = current_end

        # For words AFTER Muqatta'at in first ayah:
        # CTC gave these words too much time when it compressed Muqatta'at.
        # We need to compress them to fit in the remaining ayah time.
        remaining_words = word_timings[muqattaat_end_idx:]
        if remaining_words:
            original_remaining_start = remaining_words[0]["start"]
            original_remaining_end = remaining_words[-1]["end"]
            original_remaining_duration = original_remaining_end - original_remaining_start

            if original_remaining_duration > 0:
                # Keep the same ayah end time - don't extend the ayah
                # This means remaining words get compressed
                target_remaining_duration = original_remaining_end - new_muqattaat_end

                if target_remaining_duration > 0:
                    compress_factor = target_remaining_duration / original_remaining_duration

                    logger.info(
                        f"Compressing remaining words: {original_remaining_duration:.2f}s -> "
                        f"{target_remaining_duration:.2f}s (factor: {compress_factor:.3f})"
                    )

                    for wt in remaining_words:
                        # Scale relative to original start, then offset to new start
                        rel_start = wt["start"] - original_remaining_start
                        rel_end = wt["end"] - original_remaining_start
                        wt["start"] = round(new_muqattaat_end + rel_start * compress_factor, 3)
                        wt["end"] = round(new_muqattaat_end + rel_end * compress_factor, 3)

        # Update first ayah times
        first_aligned["start_time"] = word_timings[0]["start"]
        first_aligned["end_time"] = word_timings[-1]["end"]

        # DON'T shift subsequent ayahs - CTC timing for them should be correct
        # The Muqatta'at adjustment only affects the internal timing of ayah 1

        return aligned_ayahs

    def align_surah(
        self,
        audio_path: Path,
        ayahs: List[Dict[str, Any]],
        surah_no: int = 1,
        skip_istiiadha: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        Align surah audio file with ayahs.

        Args:
            audio_path: Path to audio file (WAV or MP3)
            ayahs: List of ayah dicts
            surah_no: Surah number (for offset calculation)
            skip_istiiadha: Skip initial isti'adha portion

        Returns:
            Aligned ayahs with timings
        """
        import librosa

        audio, sr = librosa.load(audio_path, sr=self.SAMPLE_RATE, mono=True)
        return self.align_ayahs(audio, ayahs, sr, surah_no=surah_no, skip_istiiadha=skip_istiiadha)
