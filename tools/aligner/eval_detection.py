"""Python port of src/services/quranSearchIndex.ts for offline detection evaluation.

Canonical source: src/services/quranSearchIndex.ts
This is a minimal reimplementation for eval purposes. If the TS version changes,
this file should be updated to match.

Uses the same algorithm: inverted index → anchor selection → sequential scoring →
deduplicate by surah:ayah → return top-N candidates.
"""

import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from rapidfuzz.distance import Levenshtein

from eval_config import QALOON_DATA, normalize_arabic

logger = logging.getLogger("eval_detection")

# ─── Constants (must match quranSearchIndex.ts) ───────────────

MAX_ANCHOR_HITS = 500
MIN_MATCHES = 4
MIN_SCORE = 0.45
SKIP_TOLERANCE = 3
MIN_SIMILARITY = 0.40
MAX_ANCHORS = 3
MIN_ASR_WORDS = 5

# ─── Preamble sequences (must match quranSearchIndex.ts) ──────

PREAMBLE_WORDS = {
    "اعوذ", "بالله", "الشيطان", "الرجيم",
    "عوذ", "شيطان", "رجيم",
}

PREAMBLE_SEQUENCES = [
    ["اعوذ", "بالله", "من", "الشيطان", "الرجيم", "بسم", "الله", "الرحمن", "الرحيم"],
    ["اعوذ", "بالله", "من", "الشيطان", "الرجيم"],
    ["بسم", "الله", "الرحمن", "الرحيم"],
]


# ─── Word data ────────────────────────────────────────────────


@dataclass
class GlobalWord:
    normalized: str
    surah: int
    ayah: int
    word_index: int  # 1-based within ayah
    global_position: int


# ─── Utility ──────────────────────────────────────────────────

# Strip ayah number marker at end of text (Arabic numeral or digits)
_AYAH_NUM_RE = re.compile(r"\s*[\u06DD\uFD3E-\uFD3F\d]+\s*$")


def _strip_ayah_number(text: str) -> str:
    """Remove the ayah number marker from the end of ayah text."""
    # Remove end-of-ayah mark (۝ + digits, or just trailing digits in parens)
    return _AYAH_NUM_RE.sub("", text).strip()


def word_similarity(a: str, b: str) -> float:
    """Levenshtein-based similarity, matching TS wordSimilarity."""
    if a == b:
        return 1.0
    if not a or not b:
        return 0.0
    return Levenshtein.normalized_similarity(a, b)


# ─── Detection index ─────────────────────────────────────────


class QuranDetectionIndex:
    """Python port of QuranSearchIndex for offline eval.

    Builds once, provides find_top_candidates() matching the TS behavior.
    """

    _instance: "QuranDetectionIndex | None" = None

    def __init__(self):
        self.all_words: list[GlobalWord] = []
        self.inverted_index: dict[str, list[int]] = {}
        self._build()

    @classmethod
    def get_instance(cls) -> "QuranDetectionIndex":
        """Singleton — index is expensive to build (~1s)."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _build(self):
        """Build flat word array + inverted index from QaloonData."""
        import time

        t0 = time.monotonic()

        with open(QALOON_DATA, "r", encoding="utf-8") as f:
            data = json.load(f)

        global_pos = 0
        for entry in data:
            surah = entry["sura_no"]
            ayah = entry["aya_no"]
            text = _strip_ayah_number(entry["aya_text"])
            words = text.split()

            for wi, word in enumerate(words):
                normalized = normalize_arabic(word)
                if not normalized:
                    continue

                gw = GlobalWord(
                    normalized=normalized,
                    surah=surah,
                    ayah=ayah,
                    word_index=wi + 1,
                    global_position=global_pos,
                )
                self.all_words.append(gw)

                if normalized not in self.inverted_index:
                    self.inverted_index[normalized] = []
                self.inverted_index[normalized].append(global_pos)

                global_pos += 1

        elapsed = time.monotonic() - t0
        logger.info(
            f"Detection index built: {len(self.all_words)} words, "
            f"{len(self.inverted_index)} unique, {elapsed:.1f}s"
        )

    def _strip_preamble(self, normalized_asr: list[str]) -> list[str]:
        """Strip known preamble (isti'adha + bismillah) from ASR words."""
        if not normalized_asr:
            return normalized_asr

        best_strip = 0

        for seq in PREAMBLE_SEQUENCES:
            seq_ptr = 0
            asr_ptr = 0

            while seq_ptr < len(seq) and asr_ptr < len(normalized_asr):
                sim = word_similarity(normalized_asr[asr_ptr], seq[seq_ptr])
                if sim >= 0.50:
                    seq_ptr += 1
                    asr_ptr += 1
                elif normalized_asr[asr_ptr] in PREAMBLE_WORDS:
                    asr_ptr += 1
                else:
                    break

            if seq_ptr >= len(seq) * 0.6 and asr_ptr > best_strip:
                best_strip = asr_ptr

        if best_strip > 0:
            return normalized_asr[best_strip:]
        return normalized_asr

    def _score_candidate(
        self, normalized_asr: list[str], start_pos: int
    ) -> tuple[int, int]:
        """Score a candidate by sequential forward matching.

        Returns (matched_count, first_match_position).
        """
        matched = 0
        expected_ptr = start_pos
        first_match = -1

        for asr_word in normalized_asr:
            if expected_ptr >= len(self.all_words):
                break

            search_end = min(len(self.all_words), expected_ptr + SKIP_TOLERANCE + 1)
            for ei in range(expected_ptr, search_end):
                sim = word_similarity(asr_word, self.all_words[ei].normalized)
                if sim >= MIN_SIMILARITY:
                    matched += 1
                    if first_match < 0:
                        first_match = ei
                    expected_ptr = ei + 1
                    break

        return matched, first_match

    def find_top_candidates(
        self, asr_words: list[str], max_candidates: int = 3
    ) -> list[dict[str, Any]]:
        """Find top-N candidate positions for the given ASR words.

        Args:
            asr_words: Normalized Arabic words from ASR output.
            max_candidates: Maximum candidates to return.

        Returns:
            List of dicts with keys: surah, ayah, score, match_count, global_position
        """
        if not asr_words:
            return []

        normalized = [normalize_arabic(w) for w in asr_words]
        normalized = [w for w in normalized if w]
        if len(normalized) < 2:
            return []

        # Strip preamble
        normalized = self._strip_preamble(normalized)
        if len(normalized) < MIN_ASR_WORDS:
            return []

        # Collect anchors
        anchors: list[tuple[int, list[int]]] = []  # (idx_in_asr, global_positions)
        used: set[str] = set()

        for i, word in enumerate(normalized):
            if len(anchors) >= MAX_ANCHORS:
                break
            if word in used:
                continue
            hits = self.inverted_index.get(word, [])
            if hits and len(hits) < MAX_ANCHOR_HITS:
                anchors.append((i, hits))
                used.add(word)

        # Fallback: any word with hits
        if not anchors:
            for i, word in enumerate(normalized):
                if word in used:
                    continue
                hits = self.inverted_index.get(word, [])
                if hits:
                    anchors.append((i, hits))
                    used.add(word)
                    break

        if not anchors:
            return []

        # Score all candidates, deduplicate by surah:ayah
        candidate_map: dict[str, dict[str, Any]] = {}

        for anchor_idx, positions in anchors:
            for anchor_global in positions:
                for slack in range(2):
                    start_pos = anchor_global - anchor_idx - slack
                    if start_pos < 0:
                        continue

                    matched, first_match = self._score_candidate(normalized, start_pos)
                    score = matched / len(normalized) if normalized else 0

                    if matched >= MIN_MATCHES and score >= MIN_SCORE:
                        gpos = first_match if first_match >= 0 else start_pos
                        word = self.all_words[gpos]
                        key = f"{word.surah}:{word.ayah}"

                        existing = candidate_map.get(key)
                        if not existing or score > existing["score"] or (
                            score == existing["score"]
                            and matched > existing["match_count"]
                        ):
                            candidate_map[key] = {
                                "surah": word.surah,
                                "ayah": word.ayah,
                                "score": score,
                                "match_count": matched,
                                "global_position": gpos,
                            }

        if not candidate_map:
            return []

        # Sort by score desc, return top N
        sorted_candidates = sorted(
            candidate_map.values(),
            key=lambda c: (c["score"], c["match_count"]),
            reverse=True,
        )

        return sorted_candidates[:max_candidates]
