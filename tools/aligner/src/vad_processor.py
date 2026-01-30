"""Voice Activity Detection using Silero VAD.

Configuration:
- Min silence: 200ms (configurable)
- Min speech: 1000ms (configurable)
- Padding: 50ms (configurable)
"""

import logging
from typing import List, Tuple
from dataclasses import dataclass
import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class VadSegment:
    """A detected speech segment."""

    start_time: float  # Start time in seconds
    end_time: float  # End time in seconds
    segment_idx: int  # Segment index


class VadProcessor:
    """Voice Activity Detection processor.

    Uses Silero VAD model for accurate speech detection in Arabic audio.
    """

    def __init__(
        self,
        min_silence_ms: int = 200,
        min_speech_ms: int = 1000,
        pad_ms: int = 50,
    ):
        """Initialize VAD processor.

        Args:
            min_silence_ms: Minimum silence to split segments
            min_speech_ms: Minimum speech duration for valid segment
            pad_ms: Padding around detected segments
        """
        self.min_silence_ms = min_silence_ms
        self.min_speech_ms = min_speech_ms
        self.pad_ms = pad_ms
        self._model = None
        self._utils = None

    def _load_model(self):
        """Lazy load Silero VAD model."""
        if self._model is not None:
            return

        try:
            import torch

            # Load Silero VAD
            model, utils = torch.hub.load(
                repo_or_dir="snakers4/silero-vad",
                model="silero_vad",
                force_reload=False,
                onnx=False,
            )
            self._model = model
            self._utils = utils
            logger.info("Silero VAD model loaded")
        except Exception as e:
            logger.error(f"Failed to load Silero VAD: {e}")
            raise

    def detect_speech(
        self, audio: np.ndarray, sample_rate: int = 16000
    ) -> List[VadSegment]:
        """Detect speech segments in audio.

        Args:
            audio: Audio samples (numpy array)
            sample_rate: Audio sample rate (should be 16000 for Silero)

        Returns:
            List of VadSegment objects
        """
        self._load_model()

        # Ensure mono and correct sample rate
        if len(audio.shape) > 1:
            audio = audio.mean(axis=1)

        if sample_rate != 16000:
            # Resample to 16000 Hz
            audio = self._resample(audio, sample_rate, 16000)
            sample_rate = 16000

        # Convert to torch tensor
        import torch

        audio_tensor = torch.tensor(audio, dtype=torch.float32)

        # Get speech timestamps
        get_speech_timestamps = self._utils[0]

        timestamps = get_speech_timestamps(
            audio_tensor,
            self._model,
            sampling_rate=sample_rate,
            min_silence_duration_ms=self.min_silence_ms,
            speech_pad_ms=self.pad_ms,
            threshold=0.5,  # Speech probability threshold
        )

        # Convert to VadSegment objects
        segments = []
        for idx, ts in enumerate(timestamps):
            start = ts["start"] / sample_rate
            end = ts["end"] / sample_rate

            # Filter by minimum speech duration
            if (end - start) * 1000 >= self.min_speech_ms:
                segments.append(
                    VadSegment(start_time=start, end_time=end, segment_idx=idx)
                )

        logger.info(f"VAD detected {len(segments)} speech segments")
        return segments

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
            # Fallback to scipy
            from scipy import signal

            num_samples = int(len(audio) * target_rate / orig_rate)
            return signal.resample(audio, num_samples)
