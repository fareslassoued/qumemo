"""CTC forced alignment using torchaudio and wav2vec2 Arabic model."""

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from .text_cleaner import TextCleaner

logger = logging.getLogger(__name__)


class CTCAligner:
    """CTC forced alignment for Arabic Quran audio using torchaudio."""

    MODEL_ID = "jonatasgrosman/wav2vec2-large-xlsr-53-arabic"
    SAMPLE_RATE = 16000

    def __init__(self, device: Optional[str] = None):
        """
        Initialize CTC aligner.

        Args:
            device: 'cuda' or 'cpu'. Auto-detects if None.
        """
        self.device = device
        self._model = None
        self._labels = None
        self._dictionary = None
        self.text_cleaner = TextCleaner()

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
    ) -> List[Tuple[float, float, str]]:
        """
        Compute word-level alignments using torchaudio forced alignment.

        Args:
            waveform: Audio tensor (1, samples) at model sample rate
            transcript: List of words to align

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

        # Group tokens by word
        alignments = []
        current_pos = 0

        for i, word in enumerate(transcript):
            start_idx = word_boundaries[i]
            end_idx = word_boundaries[i + 1]

            if start_idx >= end_idx:
                continue

            # Find frames for this word's tokens
            word_frames = []
            for frame_idx, token in enumerate(aligned_tokens):
                if token != 0:  # Not blank
                    if current_pos >= start_idx and current_pos < end_idx:
                        word_frames.append(frame_idx)
                    current_pos += 1
                    if current_pos >= end_idx:
                        break

            if word_frames:
                start_time = min(word_frames) * frame_duration
                end_time = (max(word_frames) + 1) * frame_duration
                alignments.append((start_time, end_time, word))

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
        words = self.text_cleaner.split_words(text)
        if not words:
            return []

        try:
            self._load_model()

            # Convert to tensor and resample if needed
            waveform = self._torch.from_numpy(audio).float().unsqueeze(0)

            if sample_rate != self._sample_rate:
                waveform = self._torchaudio.functional.resample(
                    waveform, sample_rate, self._sample_rate
                )

            # Compute alignments
            alignments = self._compute_alignments(waveform, words)

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
        return self._simple_alignment(audio, words, sample_rate)

    def align_ayahs(
        self,
        audio: np.ndarray,
        ayahs: List[Dict[str, Any]],
        sample_rate: int = 16000,
    ) -> List[Dict[str, Any]]:
        """
        Align full surah audio with ayahs.

        This aligns each ayah segment separately for better accuracy.

        Args:
            audio: Full surah audio waveform
            ayahs: List of ayah dicts with 'aya_text' field
            sample_rate: Audio sample rate

        Returns:
            List of ayahs with added timing information
        """
        # First pass: estimate ayah boundaries based on word counts
        total_words = sum(
            len(self.text_cleaner.split_words(a["aya_text"]))
            for a in ayahs
        )

        if total_words == 0:
            logger.warning("No words found in ayahs")
            return ayahs

        audio_duration = len(audio) / sample_rate

        # Estimate duration per word (uniform distribution)
        duration_per_word = audio_duration / total_words

        # Assign initial time ranges to each ayah
        current_time = 0.0
        aligned_ayahs = []

        for ayah in ayahs:
            words = self.text_cleaner.split_words(ayah["aya_text"])
            num_words = len(words)

            if num_words == 0:
                aligned_ayahs.append({
                    **ayah,
                    "start_time": current_time,
                    "end_time": current_time,
                    "word_timings": [],
                })
                continue

            # Estimate ayah duration
            ayah_duration = num_words * duration_per_word
            end_time = min(current_time + ayah_duration, audio_duration)

            # Extract audio segment for this ayah
            start_sample = int(current_time * sample_rate)
            end_sample = int(end_time * sample_rate)
            ayah_audio = audio[start_sample:end_sample]

            # Align words within this segment
            word_timings = self.align_audio(ayah_audio, ayah["aya_text"], sample_rate)

            # Adjust timings to global time
            for wt in word_timings:
                wt["start"] = round(wt["start"] + current_time, 3)
                wt["end"] = round(wt["end"] + current_time, 3)

            # Use actual word timings for ayah boundaries
            if word_timings:
                start_time = word_timings[0]["start"]
                end_time = word_timings[-1]["end"]
            else:
                start_time = current_time
                end_time = current_time + ayah_duration

            aligned_ayahs.append({
                **ayah,
                "start_time": round(start_time, 3),
                "end_time": round(end_time, 3),
                "word_timings": word_timings,
            })

            current_time = end_time

        return aligned_ayahs

    def align_surah(
        self,
        audio_path: Path,
        ayahs: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """
        Align surah audio file with ayahs.

        Args:
            audio_path: Path to audio file (WAV or MP3)
            ayahs: List of ayah dicts

        Returns:
            Aligned ayahs with timings
        """
        import librosa

        audio, sr = librosa.load(audio_path, sr=self.SAMPLE_RATE, mono=True)
        return self.align_ayahs(audio, ayahs, sr)
