"""Whisper ASR for transcribing VAD segments.

Uses tarteel-ai/whisper-base-ar-quran model for Arabic transcription.
"""

import logging
from typing import List
from dataclasses import dataclass
import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class Transcription:
    """Transcription result for a segment."""

    text: str
    confidence: float


class WhisperASR:
    """Whisper ASR processor for Arabic audio.

    Uses tarteel-ai/whisper-base-ar-quran model optimized for Quran recitation.
    """

    MODEL_NAME = "tarteel-ai/whisper-base-ar-quran"

    def __init__(self):
        """Initialize Whisper ASR."""
        self._model = None
        self._processor = None
        self._device = None

    def _load_model(self):
        """Lazy load Whisper model."""
        if self._model is not None:
            return

        try:
            import torch
            from transformers import WhisperForConditionalGeneration, WhisperProcessor

            logger.info(f"Loading Whisper model: {self.MODEL_NAME}")

            # Load processor and model
            self._processor = WhisperProcessor.from_pretrained(self.MODEL_NAME)
            self._model = WhisperForConditionalGeneration.from_pretrained(
                self.MODEL_NAME
            )

            # Move to GPU if available
            self._device = "cuda" if torch.cuda.is_available() else "cpu"
            self._model.to(self._device)

            logger.info(f"Whisper model loaded on {self._device}")

        except Exception as e:
            logger.error(f"Failed to load Whisper model: {e}")
            raise

    def transcribe(self, audio: np.ndarray, sample_rate: int = 16000) -> Transcription:
        """Transcribe a single audio segment.

        Args:
            audio: Audio samples (numpy array)
            sample_rate: Audio sample rate

        Returns:
            Transcription object
        """
        self._load_model()

        import torch

        # Ensure correct sample rate
        if sample_rate != 16000:
            audio = self._resample(audio, sample_rate, 16000)

        # Process audio
        inputs = self._processor(audio, sampling_rate=16000, return_tensors="pt")

        # Move to device
        input_features = inputs.input_features.to(self._device)

        # Generate transcription
        with torch.no_grad():
            predicted_ids = self._model.generate(input_features)

        # Decode
        transcription_text = self._processor.batch_decode(
            predicted_ids, skip_special_tokens=True
        )[0]

        # Calculate confidence (simplified - use log probs if available)
        confidence = 0.9  # Default high confidence for now

        return Transcription(text=transcription_text.strip(), confidence=confidence)

    def transcribe_batch(
        self, audio_segments: List[np.ndarray], sample_rate: int = 16000
    ) -> List[Transcription]:
        """Transcribe multiple audio segments in batch.

        Args:
            audio_segments: List of audio sample arrays
            sample_rate: Audio sample rate

        Returns:
            List of Transcription objects
        """
        self._load_model()

        import torch

        transcriptions = []

        # Process in batches of 8 for efficiency
        batch_size = 8
        for i in range(0, len(audio_segments), batch_size):
            batch = audio_segments[i : i + batch_size]

            # Ensure correct sample rate for all
            processed_batch = []
            for audio in batch:
                if sample_rate != 16000:
                    audio = self._resample(audio, sample_rate, 16000)
                processed_batch.append(audio)

            # Process batch
            inputs = self._processor(
                processed_batch, sampling_rate=16000, return_tensors="pt", padding=True
            )

            input_features = inputs.input_features.to(self._device)

            with torch.no_grad():
                predicted_ids = self._model.generate(input_features)

            texts = self._processor.batch_decode(
                predicted_ids, skip_special_tokens=True
            )

            for text in texts:
                transcriptions.append(Transcription(text=text.strip(), confidence=0.9))

            logger.info(
                f"Transcribed batch {i // batch_size + 1}/{(len(audio_segments) + batch_size - 1) // batch_size}"
            )

        return transcriptions

    def _resample(
        self, audio: np.ndarray, orig_rate: int, target_rate: int
    ) -> np.ndarray:
        """Resample audio to target rate."""
        if orig_rate == target_rate:
            return audio

        try:
            import librosa

            return librosa.resample(
                audio.astype(np.float32), orig_sr=orig_rate, target_sr=target_rate
            )
        except ImportError:
            from scipy import signal

            num_samples = int(len(audio) * target_rate / orig_rate)
            return signal.resample(audio, num_samples)
