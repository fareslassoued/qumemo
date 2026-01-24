"""Quran Audio Aligner - CTC forced alignment for Qaloon recitation."""

# Lazy imports to avoid dependency issues when only using specific modules
__all__ = ["TextCleaner", "AudioProcessor", "CTCAligner", "OutputFormatter"]


def __getattr__(name):
    """Lazy import modules on first access."""
    if name == "TextCleaner":
        from .text_cleaner import TextCleaner
        return TextCleaner
    elif name == "AudioProcessor":
        from .audio_processor import AudioProcessor
        return AudioProcessor
    elif name == "CTCAligner":
        from .ctc_aligner import CTCAligner
        return CTCAligner
    elif name == "OutputFormatter":
        from .output_formatter import OutputFormatter
        return OutputFormatter
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
