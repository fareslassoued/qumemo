"""ASR evaluation framework — configuration, eval sets, and model registry.

Provides:
- Curated evaluation sets (core/short/full) for benchmarking
- Model registry for comparing ASR backends
- normalize_arabic() matching TypeScript phonemeService.ts exactly
"""

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

# ─── Paths ────────────────────────────────────────────────────

ALIGNER_ROOT = Path(__file__).parent
OUTPUT_DIR = ALIGNER_ROOT / "output"
CACHE_WAV_DIR = ALIGNER_ROOT / "cache" / "wav"
REPORTS_DIR = ALIGNER_ROOT / "reports"
QALOON_DATA = ALIGNER_ROOT.parent.parent / "src" / "data" / "quran" / "QaloonData_v10.json"

# ─── Eval sets ────────────────────────────────────────────────

EVAL_SETS: dict[str, list[int]] = {
    # 10 surahs covering: muqatta'at (19, 36), repeated refrains (55),
    # very short (97, 112, 114), very long (2), moderate (67, 78), baseline (1)
    "core": [1, 2, 19, 36, 55, 67, 78, 97, 112, 114],
    # Quick smoke test — ~3 min of audio total
    "short": [1, 97, 112, 113, 114],
    # All 114 surahs
    "full": list(range(1, 115)),
}

# ─── Model registry ──────────────────────────────────────────


@dataclass
class ModelConfig:
    """Configuration for an ASR model under evaluation."""

    name: str
    model_id: str  # HuggingFace ID or local path
    backend: str  # "transformers" or "faster_whisper"
    language: str = "ar"
    compute_type: str = "float32"  # for faster_whisper: int8, float16, etc.
    task: str = "transcribe"


MODELS: dict[str, ModelConfig] = {
    "tarteel-base": ModelConfig(
        "tarteel-base",
        "tarteel-ai/whisper-base-ar-quran",
        "transformers",
    ),
    "whisper-small": ModelConfig(
        "whisper-small",
        "openai/whisper-small",
        "transformers",
    ),
    "whisper-medium": ModelConfig(
        "whisper-medium",
        "openai/whisper-medium",
        "transformers",
    ),
    "whisper-large-v3": ModelConfig(
        "whisper-large-v3",
        "openai/whisper-large-v3",
        "transformers",
    ),
    "tarteel-base-ct2": ModelConfig(
        "tarteel-base-ct2",
        str(ALIGNER_ROOT.parent / "asr-server" / ".ct2-models" / "whisper-base-ar-quran"),
        "faster_whisper",
        compute_type="int8",
    ),
    "tarbiyah-medium": ModelConfig(
        "tarbiyah-medium",
        "Habib-HF/tarbiyah-ai-whisper-medium-merged",
        "transformers",
    ),
    "whisper-large-v3-turbo": ModelConfig(
        "whisper-large-v3-turbo",
        "openai/whisper-large-v3-turbo",
        "transformers",
    ),
    "large-v3-tarteel": ModelConfig(
        "large-v3-tarteel",
        "IJyad/whisper-large-v3-Tarteel",
        "transformers",
    ),
}

# ─── Arabic normalization (must match TS phonemeService.ts:110-128) ──

# Regex matching the exact Unicode ranges from the TypeScript version.
# Any divergence here will produce incorrect WER numbers.
_DIACRITICS_RE = re.compile(
    r"[\u064B-\u065F"  # tashkil (fatha, kasra, damma, shadda, sukun, etc.)
    r"\u0670"  # superscript alif
    r"\u06D6-\u06DC"  # small high marks (waqf, sajda, etc.)
    r"\u06DF-\u06E4"  # small letters/marks
    r"\u06E7-\u06E8"  # small letters
    r"\u06EA-\u06ED"  # additional marks (empty centre stop, small meem, etc.)
    r"\u0653-\u0655"  # maddah above, hamza above/below
    r"]"
)

_HAMZA_RE = re.compile(r"[أإآٱ]")


_QALUN_CHARS_NORM_RE = re.compile(r"[\u06E5\u06E6\u06DE]")


def normalize_arabic(text: str) -> str:
    """Normalize Arabic text for ASR evaluation.

    MUST match src/services/phonemeService.ts normalizeArabic() exactly.
    See that file for the definitive Unicode range documentation.
    """
    result = text.replace("\u0640", "")  # tatweel (kashida)
    result = _HAMZA_RE.sub("ا", result)  # hamza variants → bare alif
    result = result.replace("\u06D2", "\u064A")  # ے (yaa barree) → ي
    result = _QALUN_CHARS_NORM_RE.sub("", result)  # ۥ small waw, ۦ small yaa, ۞
    result = _DIACRITICS_RE.sub("", result)  # strip all diacritics
    return result.strip()


def normalize_words(text: str) -> list[str]:
    """Normalize and split Arabic text into words."""
    return normalize_arabic(text).split()


# ─── Qalun↔Standard orthography normalization ────────────────
#
# Qalun rasm (Maghrebi orthographic tradition) differs from Standard
# Uthmanic text in systematic, predictable ways. Whisper outputs Standard
# Arabic, but our ground truth is Qalun. This layer collapses the
# differences so WER measures actual recognition errors, not spelling.

# Characters that survive normalize_arabic but differ between Qalun/Standard
_QALUN_CHARS_RE = re.compile(
    r"[\u06D2"  # ے yaa barree → ي (Qalun uses this for final yaa)
    r"\u06E5"   # ۥ small waw (pronoun marker on ـهۥ)
    r"\u06E6"   # ۦ small yaa (pronoun marker on ـهۦ)
    r"\u06DE"   # ۞ rubʿ al-ḥizb mark
    r"]"
)

# Qalun contracted-alif patterns → Standard expanded forms.
# These are the most frequent mismatches (>2 occurrences in eval data).
# Order matters: longer patterns first to avoid partial matches.
_QALUN_WORD_MAP: dict[str, str] = {
    # Contracted alif patterns (Qalun drops alif in certain words)
    "السموت": "السماوات",
    "الصلحت": "الصالحات",
    "صرط": "صراط",
    "الصرط": "الصراط",
    "الكتب": "الكتاب",
    "الشيطن": "الشيطان",
    "ضلل": "ضلال",
    "الضللة": "الضلالة",
    "الملئكة": "الملائكة",
    "والملئكة": "والملائكة",
    "اصحب": "اصحاب",
    "خلدون": "خالدون",
    "الغمم": "الغمام",
    "اليل": "الليل",
    "للكفرين": "للكافرين",
    "الكفرين": "الكافرين",
    "وحد": "واحد",
    "وحدة": "واحدة",
    # Hamza-on-line (ء) — Qalun writes standalone hamza, Standard drops it
    "ءامنوا": "امنوا",
    "ءادم": "ادم",
    "ءاباؤهم": "اباؤهم",
    "ءايت": "ايات",
    "ءايتنا": "اياتنا",
    # Common Qalun-specific contracted forms
    "احصينه": "احصيناه",
    "اريتم": "ارايتم",
    "ابرهيم": "ابراهيم",
    "اسمعيل": "اسماعيل",
    "ظلمون": "ظالمون",
    "الظلمين": "الظالمين",
    "سلطن": "سلطان",
    "ميثق": "ميثاق",
    "ميثقهم": "ميثاقهم",
    "نبيا": "نبيئا",
    "شيا": "شيئا",
    "يايها": "يا ايها",
    "يابت": "يا ابت",
    "يابنا": "يا ابنا",
    "بايتنا": "باياتنا",
    "بايت": "بايات",
    "الحيوة": "الحياة",
    "الزكوة": "الزكاة",
    "الصلوة": "الصلاة",
    "التورىة": "التوراة",
    "مشكوة": "مشكاة",
    "منوة": "مناة",
    "الغدوة": "الغداة",
    "النجوة": "النجاة",
    "كمشكوة": "كمشكاة",
}


def normalize_qalun(text: str) -> str:
    """Additional normalization that collapses Qalun↔Standard differences.

    Applied ON TOP of normalize_arabic(). Use this for WER comparison
    to measure actual ASR recognition errors, not orthographic differences.
    """
    # Strip Qalun-specific characters (yaa barree → yaa, small waw/yaa → nothing)
    result = text.replace("\u06D2", "\u064A")  # ے → ي
    result = _QALUN_CHARS_RE.sub("", result)

    # Word-level replacements
    words = result.split()
    normalized = []
    for w in words:
        normalized.append(_QALUN_WORD_MAP.get(w, w))

    return " ".join(normalized)


def normalize_for_wer(text: str) -> str:
    """Full normalization pipeline for WER comparison.

    Applies: normalize_arabic (diacritics) → normalize_qalun (orthography).
    """
    return normalize_qalun(normalize_arabic(text))
