"""Text matching using phoneme-level DP alignment.

Implements constrained substring edit-distance DP for matching
ASR transcriptions to Quran reference text.

Based on: https://huggingface.co/spaces/hetchyy/Quran-segmentation-transcription
"""

import logging
from typing import List, Tuple, Optional
from dataclasses import dataclass
import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class MatchResult:
    """Result of matching a segment to Quran text."""

    score: float  # Match score (0-1)
    start_word: int  # Global start word index
    end_word: int  # Global end word index
    matched_text: str  # Matched text from Quran
    edit_distance: int  # Edit distance


class TextMatcher:
    """Matches transcribed text to Quran using phoneme-level DP alignment."""

    def __init__(
        self,
        max_norm_dist: float = 0.30,  # Increased from 0.15 for better matching
        lookback_words: int = 25,
        lookahead_words: int = 15,
    ):
        """Initialize text matcher.

        Args:
            max_norm_dist: Maximum normalized edit distance for acceptance
            lookback_words: Words to look back from pointer
            lookahead_words: Words to look ahead from pointer
        """
        self.max_norm_dist = max_norm_dist
        self.lookback_words = lookback_words
        self.lookahead_words = lookahead_words
        self.phoneme_mapper = None

    def _get_phoneme_mapper(self):
        """Lazy load phoneme mapper."""
        if self.phoneme_mapper is None:
            try:
                from .phoneme_mapper import ArabicPhonemeMapper
            except ImportError:
                from phoneme_mapper import ArabicPhonemeMapper

            self.phoneme_mapper = ArabicPhonemeMapper()
        return self.phoneme_mapper

    def estimate_word_count(
        self, phoneme_count: int, avg_phonemes_per_word: float = 3.0
    ) -> int:
        """Estimate number of words from phoneme count.

        Args:
            phoneme_count: Number of phonemes
            avg_phonemes_per_word: Average phonemes per word

        Returns:
            Estimated word count
        """
        est = round(phoneme_count / max(avg_phonemes_per_word, 0.001))
        return max(1, min(est, 200))  # Clamp between 1-200

    def transcribed_text_to_phonemes(self, text: str) -> List[str]:
        """Convert transcribed text to phonemes.

        Args:
            text: Transcribed Arabic text

        Returns:
            List of phonemes
        """
        mapper = self._get_phoneme_mapper()
        mappings = mapper.text_to_phonemes(text)

        phonemes = []
        for mapping in mappings:
            phonemes.extend(mapping.phonemes)

        return phonemes

    def align_segment_to_window(
        self,
        transcribed_phonemes: List[str],
        reference_phonemes: List[str],
        word_boundaries: List[int],
    ) -> Optional[MatchResult]:
        """Align transcribed phonemes to reference window using DP.

        Uses constrained substring edit-distance DP where we match the
        transcribed sequence to any substring of the reference, enforcing
        start and end on word boundaries.

        Args:
            transcribed_phonemes: Phonemes from ASR transcription
            reference_phonemes: Phonemes from Quran reference window
            word_boundaries: word_boundaries[i] = word index for reference_phonemes[i]

        Returns:
            MatchResult if successful alignment found, None otherwise
        """
        if not transcribed_phonemes or not reference_phonemes:
            return None

        m = len(transcribed_phonemes)
        n = len(reference_phonemes)

        # DP arrays - use two rows for O(n) memory
        dp_prev = np.zeros(n + 1, dtype=np.int32)
        dp_cur = np.zeros(n + 1, dtype=np.int32)

        # Backtrack array - store which operation was used
        # 0 = match/substitution, 1 = delete from transcribed, 2 = insert to transcribed
        backtrack = np.zeros((m + 1, n + 1), dtype=np.int8)

        # Initialize: DP[0][j] = 0 for local alignment (can start anywhere)
        for j in range(n + 1):
            dp_prev[j] = 0
            backtrack[0][j] = 0

        # Fill DP table
        for i in range(1, m + 1):
            dp_cur[0] = i  # Delete all phonemes from transcribed
            backtrack[i][0] = 1

            for j in range(1, n + 1):
                # Calculate costs
                sub_cost = (
                    0 if transcribed_phonemes[i - 1] == reference_phonemes[j - 1] else 1
                )

                match_cost = dp_prev[j - 1] + sub_cost
                delete_cost = dp_prev[j] + 1  # Delete from transcribed
                insert_cost = (
                    dp_cur[j - 1] + 1
                )  # Insert to transcribed (skip reference)

                # Choose minimum
                min_cost = match_cost
                operation = 0

                if delete_cost < min_cost:
                    min_cost = delete_cost
                    operation = 1

                if insert_cost < min_cost:
                    min_cost = insert_cost
                    operation = 2

                dp_cur[j] = min_cost
                backtrack[i][j] = operation

            # Swap rows
            dp_prev, dp_cur = dp_cur, dp_prev

        # Find best end position at word boundary
        best_j = -1
        best_score = float("inf")

        # Get unique word end positions
        word_ends = {}
        for j in range(n):
            word_idx = word_boundaries[j]
            if word_idx not in word_ends or j > word_ends[word_idx]:
                word_ends[word_idx] = j

        # Check DP values at word ends (j+1 in DP table)
        for word_idx, end_pos in word_ends.items():
            j_dp = end_pos + 1
            if j_dp <= n:
                score = dp_prev[j_dp]
                if score < best_score:
                    best_score = score
                    best_j = j_dp

        if best_j == -1:
            return None

        # Traceback to find start position
        i, j = m, best_j
        start_j = best_j

        while i > 0:
            operation = backtrack[i][j]

            if operation == 0:  # Match/substitution
                i -= 1
                j -= 1
                start_j = j
            elif operation == 1:  # Delete
                i -= 1
            else:  # Insert
                j -= 1

            if j <= 0:
                break

        # Enforce start on word boundary
        start_j = max(0, min(start_j, n - 1))
        start_word_idx = word_boundaries[start_j]
        end_word_idx = (
            word_boundaries[best_j - 1] if best_j > 0 else word_boundaries[-1]
        )

        # Calculate normalized distance
        edit_dist = dp_prev[best_j]
        denom = max(m, best_j - start_j)
        norm_dist = edit_dist / max(denom, 1)

        # Check if acceptable
        if norm_dist > self.max_norm_dist:
            return None

        # Calculate score (1.0 - normalized distance)
        score = float(max(0.0, 1.0 - norm_dist))

        return MatchResult(
            score=score,
            start_word=int(start_word_idx),
            end_word=int(end_word_idx),
            matched_text="",  # Will be filled by caller
            edit_distance=int(edit_dist),
        )

    def match_segment(
        self,
        transcribed_text: str,
        quran_index,
        pointer: int,
        avg_phonemes_per_word: float = 3.0,
    ) -> Optional[MatchResult]:
        """Match a transcribed segment to Quran text.

        Args:
            transcribed_text: Text from ASR
            quran_index: QuranIndex object
            pointer: Current position in Quran (global word index)
            avg_phonemes_per_word: Average phonemes per word for estimation

        Returns:
            MatchResult if successful, None otherwise
        """
        # Convert transcribed text to phonemes
        transcribed_phonemes = self.transcribed_text_to_phonemes(transcribed_text)

        if not transcribed_phonemes:
            return None

        # Estimate word count
        est_words = self.estimate_word_count(
            len(transcribed_phonemes), avg_phonemes_per_word
        )

        # Build search window
        window_start = max(0, pointer - self.lookback_words)
        window_end = min(
            len(quran_index.words), pointer + est_words + self.lookahead_words
        )

        # Get reference phonemes for window
        reference_phonemes, word_boundaries = quran_index.get_phoneme_window(
            window_start, window_end
        )

        if not reference_phonemes:
            return None

        # Align
        result = self.align_segment_to_window(
            transcribed_phonemes, reference_phonemes, word_boundaries
        )

        if result is None:
            return None

        # Word indices are already global from word_boundaries
        # No need to adjust - they reference absolute positions in Quran
        pass

        # Get matched text
        result.matched_text = quran_index.get_text_window(
            result.start_word, result.end_word
        )

        return result

    def find_global_anchor(
        self,
        transcribed_segments: List[str],
        quran_index,
        num_anchor_segments: int = 5,
    ) -> Optional[int]:
        """Find which surah the audio corresponds to.

        Searches the first N segments against all surahs to find best match.

        Args:
            transcribed_segments: List of transcribed texts
            quran_index: QuranIndex object
            num_anchor_segments: Number of segments to use for anchoring

        Returns:
            Surah number if found, None otherwise
        """
        from rapidfuzz import fuzz

        anchor_texts = transcribed_segments[:num_anchor_segments]

        best_surah = None
        best_score = 0

        # Search each surah
        for surah_num in range(1, 115):  # Surahs 1-114
            start, end = quran_index.get_surah_range(surah_num)
            if start >= end:
                continue

            # Get first part of surah
            surah_text = quran_index.get_text_window(start, min(start + 100, end))

            # Calculate fuzzy match score
            combined_anchor = " ".join(anchor_texts)
            score = fuzz.ratio(combined_anchor, surah_text)

            if score > best_score:
                best_score = score
                best_surah = surah_num

        # Threshold for acceptance
        if best_score > 50:  # 50% similarity threshold
            logger.info(
                f"Global anchor found: Surah {best_surah} (score: {best_score})"
            )
            return best_surah

        return None
