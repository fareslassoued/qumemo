"""Audio download and processing for CTC alignment."""

import os
from pathlib import Path
from typing import Optional, Tuple

import numpy as np
import requests
from tqdm import tqdm

try:
    import librosa
    import soundfile as sf
except ImportError:
    librosa = None
    sf = None


class AudioProcessor:
    """Download and convert audio files for alignment."""

    ARCHIVE_URL = "https://archive.org/download/husari_qalun/{surah:03d}.mp3"
    TARGET_SAMPLE_RATE = 16000

    def __init__(self, cache_dir: Optional[Path] = None):
        """
        Initialize audio processor.

        Args:
            cache_dir: Directory for cached files. Defaults to ./cache
        """
        if cache_dir is None:
            cache_dir = Path(__file__).parent.parent / "cache"

        self.cache_dir = Path(cache_dir)
        self.mp3_dir = self.cache_dir / "mp3"
        self.wav_dir = self.cache_dir / "wav"

        # Create directories
        self.mp3_dir.mkdir(parents=True, exist_ok=True)
        self.wav_dir.mkdir(parents=True, exist_ok=True)

    def get_mp3_path(self, surah: int) -> Path:
        """Get path to MP3 file for surah."""
        return self.mp3_dir / f"{surah:03d}.mp3"

    def get_wav_path(self, surah: int) -> Path:
        """Get path to WAV file for surah."""
        return self.wav_dir / f"{surah:03d}.wav"

    def download_mp3(self, surah: int, force: bool = False) -> Path:
        """
        Download MP3 from Archive.org.

        Args:
            surah: Surah number (1-114)
            force: Re-download even if cached

        Returns:
            Path to downloaded MP3
        """
        if not 1 <= surah <= 114:
            raise ValueError(f"Invalid surah number: {surah}")

        mp3_path = self.get_mp3_path(surah)

        if mp3_path.exists() and not force:
            return mp3_path

        url = self.ARCHIVE_URL.format(surah=surah)

        # Stream download with progress bar
        response = requests.get(url, stream=True, timeout=60)
        response.raise_for_status()

        total_size = int(response.headers.get("content-length", 0))

        with open(mp3_path, "wb") as f:
            with tqdm(
                total=total_size,
                unit="B",
                unit_scale=True,
                desc=f"Downloading surah {surah:03d}",
                leave=False,
            ) as pbar:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
                    pbar.update(len(chunk))

        return mp3_path

    def convert_to_wav(
        self, surah: int, force: bool = False
    ) -> Tuple[Path, np.ndarray, int]:
        """
        Convert MP3 to 16kHz mono WAV.

        Args:
            surah: Surah number
            force: Re-convert even if cached

        Returns:
            Tuple of (wav_path, audio_array, sample_rate)
        """
        if librosa is None or sf is None:
            raise ImportError("librosa and soundfile required for audio processing")

        wav_path = self.get_wav_path(surah)

        if wav_path.exists() and not force:
            # Load existing WAV
            audio, sr = librosa.load(wav_path, sr=self.TARGET_SAMPLE_RATE, mono=True)
            return wav_path, audio, sr

        # Ensure MP3 exists
        mp3_path = self.get_mp3_path(surah)
        if not mp3_path.exists():
            self.download_mp3(surah)

        # Load MP3 and resample to 16kHz mono
        audio, sr = librosa.load(
            mp3_path, sr=self.TARGET_SAMPLE_RATE, mono=True
        )

        # Save as WAV
        sf.write(wav_path, audio, sr)

        return wav_path, audio, sr

    def get_audio(
        self, surah: int, download: bool = True
    ) -> Tuple[np.ndarray, int]:
        """
        Get audio for surah as numpy array.

        Args:
            surah: Surah number
            download: Download if not cached

        Returns:
            Tuple of (audio_array, sample_rate)
        """
        wav_path = self.get_wav_path(surah)

        if not wav_path.exists():
            if download:
                self.download_mp3(surah)
                _, audio, sr = self.convert_to_wav(surah)
                return audio, sr
            else:
                raise FileNotFoundError(f"Audio not found for surah {surah}")

        if librosa is None:
            raise ImportError("librosa required for audio processing")

        audio, sr = librosa.load(wav_path, sr=self.TARGET_SAMPLE_RATE, mono=True)
        return audio, sr

    def get_duration(self, surah: int) -> float:
        """Get duration of surah audio in seconds."""
        audio, sr = self.get_audio(surah)
        return len(audio) / sr

    def process_surah(self, surah: int, force: bool = False) -> Tuple[Path, float]:
        """
        Download and process surah audio.

        Args:
            surah: Surah number
            force: Force re-download and conversion

        Returns:
            Tuple of (wav_path, duration_seconds)
        """
        self.download_mp3(surah, force=force)
        wav_path, audio, sr = self.convert_to_wav(surah, force=force)
        duration = len(audio) / sr
        return wav_path, duration
