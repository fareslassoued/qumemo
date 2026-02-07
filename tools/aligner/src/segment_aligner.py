"""Main segment aligner orchestrator.

Coordinates VAD, ASR, text matching, and timing generation.
"""

import logging
from typing import List, Dict, Optional, Tuple, TYPE_CHECKING
from dataclasses import dataclass
from pathlib import Path

import numpy as np

# Handle both relative and absolute imports
try:
    from .quran_index import QuranIndex
    from .vad_processor import VadProcessor
    from .whisper_asr import WhisperASR
    from .text_matcher import TextMatcher
    from .special_segments import SpecialSegmentDetector, SpecialSegment
except ImportError:
    from quran_index import QuranIndex
    from vad_processor import VadProcessor
    from whisper_asr import WhisperASR
    from text_matcher import TextMatcher
    from special_segments import SpecialSegmentDetector, SpecialSegment

logger = logging.getLogger(__name__)


@dataclass
class AlignedSegment:
    """A single aligned segment with timing and text."""

    segment_idx: int
    time_start: float
    time_end: float
    ref_start: str  # "surah:ayah:word"
    ref_end: str  # "surah:ayah:word"
    matched_text: str
    score: float
    word_timings: List[Dict]  # Word-level timings
    error: Optional[str] = None


@dataclass
class ExtendedMatch:
    """Extended match result for backward extension."""

    start_word: int
    end_word: int
    matched_text: str
    score: float


class SegmentAligner:
    """Main aligner that orchestrates the alignment pipeline."""

    def __init__(
        self,
        surah_number: int,
        min_match_score: float = 0.5,
        enable_word_timings: bool = True,
    ):
        """Initialize segment aligner.

        Args:
            surah_number: Target surah number (1-114)
            min_match_score: Minimum match score for acceptance
            enable_word_timings: Whether to generate word-level timings
        """
        self.surah_number = surah_number
        self.min_match_score = min_match_score
        self.enable_word_timings = enable_word_timings

        # Initialize components
        self.quran_index = QuranIndex()
        self.vad = VadProcessor()
        self.asr = WhisperASR()
        self.matcher = TextMatcher()

        # Get surah range
        self.surah_start, self.surah_end = self.quran_index.get_surah_range(
            surah_number
        )
        logger.info(
            f"Aligner initialized for Surah {surah_number} (words {self.surah_start}-{self.surah_end})"
        )

    def load_audio(self, audio_path: Path) -> Tuple[np.ndarray, int]:
        """Load audio file.

        Args:
            audio_path: Path to audio file

        Returns:
            Tuple of (audio_samples, sample_rate)
        """
        try:
            import librosa

            audio, sr = librosa.load(str(audio_path), sr=None, mono=True)
            return audio, int(sr)
        except Exception as e:
            logger.error(f"Failed to load audio: {e}")
            raise

    def align_audio(
        self,
        audio_path: Path,
    ) -> List[AlignedSegment]:
        """Align audio to Quran text.

        Args:
            audio_path: Path to audio file

        Returns:
            List of aligned segments
        """
        # Constants for re-anchoring logic
        MAX_CONSECUTIVE_FAILURES = 3
        BASE_LOOKBACK = 25
        BASE_LOOKAHEAD = 15
        WIDE_LOOKBACK_MULTIPLIER = 2
        WIDE_LOOKAHEAD_MULTIPLIER = 3

        logger.info(f"Starting alignment for {audio_path}")
        logger.info(
            f"Re-anchoring config: MAX_CONSECUTIVE_FAILURES={MAX_CONSECUTIVE_FAILURES}"
        )

        # 1. Load audio
        audio, sample_rate = self.load_audio(audio_path)
        audio_duration = len(audio) / sample_rate
        logger.info(f"Audio loaded: {audio_duration:.1f}s @ {sample_rate}Hz")

        # 2. Run VAD
        vad_segments = self.vad.detect_speech(audio, sample_rate)
        if not vad_segments:
            logger.error("No speech segments detected")
            return []
        logger.info(f"VAD detected {len(vad_segments)} segments")

        # 3. Extract segment audio
        segment_audios = []
        for seg in vad_segments:
            start_sample = int(seg.start_time * sample_rate)
            end_sample = int(seg.end_time * sample_rate)
            segment_audios.append(audio[start_sample:end_sample])

        # 4. Transcribe segments
        transcriptions = self.asr.transcribe_batch(segment_audios, sample_rate)
        logger.info(f"Transcribed {len(transcriptions)} segments")

        # Initialize special segment detector
        special_detector = SpecialSegmentDetector()

        # 4.5. Classify first segments to detect structure
        # This handles cases where ASR misses the Basmala or merges it with Ayah 1
        try:
            from .first_segment_classifier import FirstSegmentClassifier
        except ImportError:
            from first_segment_classifier import FirstSegmentClassifier

        first_classifier = FirstSegmentClassifier(self.surah_number)
        first_segments_data = [
            (vad_seg.start_time, vad_seg.end_time, trans.text)
            for vad_seg, trans in zip(vad_segments[:4], transcriptions[:4])
        ]
        classifications, _ = first_classifier.classify_first_segments(
            first_segments_data
        )

        # Build classification lookup map for use in the matching loop
        classification_map = {c.segment_idx: c for c in classifications}

        # 5. Match each segment to Quran with re-anchoring logic
        pointer = self.surah_start  # Start at beginning of surah
        last_good_pointer = self.surah_start  # Track last successful position
        aligned_segments = []
        consecutive_failures = 0
        total_matched = 0
        total_failed = 0

        # Add synthetic Basmala if detected as missing
        if first_classifier.should_insert_missing_basmala(classifications):
            # Find Isti'adha end and Ayah 1 start
            istiadha_end = 0
            ayah1_start = float("inf")
            for c in classifications:
                if c.segment_type == "isti'adha":
                    istiadha_end = max(istiadha_end, c.end_time)
                elif c.segment_type == "ayah1":
                    ayah1_start = min(ayah1_start, c.start_time)

            if istiadha_end > 0 and ayah1_start < float("inf"):
                basmala_start, basmala_end = (
                    first_classifier.get_synthetic_basmala_timing(
                        istiadha_end, ayah1_start
                    )
                )
                logger.info(
                    f"Inserting synthetic Basmala segment: "
                    f"{basmala_start:.3f}s - {basmala_end:.3f}s"
                )

                # Create synthetic Basmala segment
                synthetic_basmala = AlignedSegment(
                    segment_idx=-1,  # Special marker
                    time_start=basmala_start,
                    time_end=basmala_end,
                    ref_start="basmala",
                    ref_end="basmala",
                    matched_text="بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
                    score=1.0,
                    word_timings=[],
                )
                aligned_segments.append(synthetic_basmala)

        for i, (vad_seg, trans) in enumerate(zip(vad_segments, transcriptions)):
            logger.debug(
                f"Processing segment {i + 1}/{len(vad_segments)}: '{trans.text}'"
            )
            logger.debug(
                f"Current pointer: {pointer}, last good: {last_good_pointer}, consecutive failures: {consecutive_failures}"
            )

            # Check if this is a special segment (Isti'adha or Basmala)
            # Only allow special detection before the first ayah match
            # to prevent ayah text (e.g. "الرحمن الرحيم") from being swallowed
            special_type = None
            if pointer == self.surah_start:
                special_type = special_detector.detect(trans.text)
            if special_type:
                # Create special segment entry
                segment = AlignedSegment(
                    segment_idx=i,
                    time_start=vad_seg.start_time,
                    time_end=vad_seg.end_time,
                    ref_start=special_type,  # Use type as ref (e.g., "isti'adha" or "basmala")
                    ref_end=special_type,
                    matched_text=special_detector.get_reference_text(special_type),
                    score=1.0,  # Special segments have high confidence
                    word_timings=[],  # No word-level timings for special segments
                )
                aligned_segments.append(segment)
                total_matched += 1
                consecutive_failures = 0  # Reset failure counter on special segment
                logger.info(
                    f"Segment {i + 1}: detected {special_type} (special segment) - pointer: {pointer}"
                )
                continue  # Skip Quran matching for special segments

            # Check if this segment is classified as Muqattaat letters
            classification = classification_map.get(i)
            if classification and classification.segment_type == "muqattaat":
                # Muqattaat segment: bypass phoneme matcher, map directly to
                # the word at the current pointer (the Muqattaat word)
                word_info = self.quran_index.get_word(pointer)
                if word_info:
                    word_timings = []
                    if self.enable_word_timings:
                        word_timings = self._generate_word_timings(
                            vad_seg.start_time,
                            vad_seg.end_time,
                            pointer,
                            pointer,  # Single word
                        )

                    segment = AlignedSegment(
                        segment_idx=i,
                        time_start=vad_seg.start_time,
                        time_end=vad_seg.end_time,
                        ref_start=self._word_to_ref(pointer),
                        ref_end=self._word_to_ref(pointer),
                        matched_text=word_info.text,
                        score=1.0,
                        word_timings=word_timings,
                    )
                    aligned_segments.append(segment)

                    logger.info(
                        f"Segment {i + 1}: Muqattaat '{word_info.text}' "
                        f"({vad_seg.start_time:.3f}s-{vad_seg.end_time:.3f}s) "
                        f"-> {self._word_to_ref(pointer)} - pointer: {pointer + 1}"
                    )

                    pointer += 1
                    last_good_pointer = pointer
                    total_matched += 1
                    consecutive_failures = 0
                    continue

            # Determine if we should use wider window due to consecutive failures
            is_wide_search = consecutive_failures >= MAX_CONSECUTIVE_FAILURES

            if is_wide_search:
                # Use wider lookback/lookahead for re-anchoring
                current_lookback = BASE_LOOKBACK * WIDE_LOOKBACK_MULTIPLIER
                current_lookahead = BASE_LOOKAHEAD * WIDE_LOOKAHEAD_MULTIPLIER
                logger.warning(
                    f"Segment {i + 1}: RE-ANCHORING MODE - using wide window "
                    f"(lookback={current_lookback}, lookahead={current_lookahead})"
                )
            else:
                current_lookback = BASE_LOOKBACK
                current_lookahead = BASE_LOOKAHEAD

            # Temporarily adjust matcher window sizes
            original_lookback = self.matcher.lookback_words
            original_lookahead = self.matcher.lookahead_words
            self.matcher.lookback_words = current_lookback
            self.matcher.lookahead_words = current_lookahead

            # Attempt to match
            match = self.matcher.match_segment(trans.text, self.quran_index, pointer)

            # Restore original window sizes
            self.matcher.lookback_words = original_lookback
            self.matcher.lookahead_words = original_lookahead

            if match and match.score >= self.min_match_score:
                # Successful match - check for gaps at the beginning
                expected_start = pointer
                gap_detected = match.start_word > expected_start

                if gap_detected:
                    gap_size = match.start_word - expected_start
                    logger.warning(
                        f"Segment {i + 1}: GAP DETECTED - expected word {expected_start}, "
                        f"but match starts at {match.start_word} (gap: {gap_size} words)"
                    )

                    # Try to extend match backwards to include missing words
                    extended_match = self._try_extend_match_backwards(
                        match, expected_start, trans.text, vad_seg, i
                    )

                    if extended_match:
                        logger.info(
                            f"Segment {i + 1}: Extended match backwards to include "
                            f"words {expected_start}-{match.start_word - 1}"
                        )
                        match = extended_match
                    else:
                        # Log missing words for manual review
                        missing_words = []
                        for w_idx in range(expected_start, match.start_word):
                            word_info = self.quran_index.get_word(w_idx)
                            if word_info:
                                missing_words.append(f"{word_info.text} ({w_idx})")
                        logger.error(
                            f"Segment {i + 1}: WORDS SKIPPED - "
                            f"Missing: {', '.join(missing_words)}"
                        )

                # Calculate timing adjustments based on phoneme position
                adjusted_start_time, adjusted_end_time = (
                    self._calculate_timing_adjustments(
                        vad_seg.start_time,
                        vad_seg.end_time,
                        match.start_word,
                        match.end_word,
                        expected_start,
                        gap_detected,
                    )
                )

                word_timings = []
                if self.enable_word_timings:
                    word_timings = self._generate_word_timings(
                        adjusted_start_time,
                        adjusted_end_time,
                        match.start_word,
                        match.end_word,
                    )

                segment = AlignedSegment(
                    segment_idx=i,
                    time_start=adjusted_start_time,
                    time_end=adjusted_end_time,
                    ref_start=self._word_to_ref(match.start_word),
                    ref_end=self._word_to_ref(match.end_word),
                    matched_text=match.matched_text,
                    score=match.score,
                    word_timings=word_timings,
                )
                aligned_segments.append(segment)

                # Update tracking variables
                last_good_pointer = match.end_word + 1
                pointer = match.end_word + 1
                consecutive_failures = 0  # Reset on success
                total_matched += 1

                if is_wide_search:
                    logger.info(
                        f"Segment {i + 1}: RE-ANCHORED to {segment.ref_start}-{segment.ref_end} "
                        f"(score: {match.score:.2f}) - pointer advanced to {pointer}"
                    )
                else:
                    logger.info(
                        f"Segment {i + 1}: matched {segment.ref_start}-{segment.ref_end} "
                        f"(score: {match.score:.2f}) - pointer: {pointer}"
                    )
            else:
                # Failed match - don't advance pointer, keep at last good position
                segment = AlignedSegment(
                    segment_idx=i,
                    time_start=vad_seg.start_time,
                    time_end=vad_seg.end_time,
                    ref_start="",
                    ref_end="",
                    matched_text="",
                    score=0.0,
                    word_timings=[],
                    error="No confident match found",
                )
                aligned_segments.append(segment)

                consecutive_failures += 1
                total_failed += 1

                # CRITICAL: Keep pointer at last good position, don't advance blindly
                pointer = last_good_pointer

                logger.warning(
                    f"Segment {i + 1}: FAILED match (consecutive failures: {consecutive_failures}) "
                    f"- keeping pointer at {pointer} (last good position)"
                )

                # If we've had too many consecutive failures, try fuzzy re-anchoring
                if consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
                    logger.warning(
                        f"Segment {i + 1}: Attempting fuzzy re-anchoring after {consecutive_failures} failures"
                    )

                    # Try to find where we are using fuzzy matching
                    reanchor_pointer = self._attempt_fuzzy_reanchor(
                        trans.text, pointer, i, vad_segments, transcriptions
                    )

                    if reanchor_pointer and reanchor_pointer != pointer:
                        logger.info(
                            f"Segment {i + 1}: Fuzzy re-anchoring succeeded - new pointer: {reanchor_pointer} "
                            f"(was: {pointer})"
                        )
                        pointer = reanchor_pointer
                        last_good_pointer = reanchor_pointer
                        consecutive_failures = 0  # Reset after successful re-anchor
                    else:
                        logger.warning(
                            f"Segment {i + 1}: Fuzzy re-anchoring failed - staying at pointer: {pointer}"
                        )

        # Handle unmatched trailing words at end of surah
        if pointer <= self.surah_end:
            unmatched_count = self.surah_end - pointer + 1
            logger.warning(
                f"{unmatched_count} trailing word(s) unmatched at end of surah "
                f"(pointer={pointer}, surah_end={self.surah_end})"
            )

            if unmatched_count <= 5:
                # Find last successful non-special segment
                last_good_seg = None
                for seg in reversed(aligned_segments):
                    if not seg.error and seg.ref_start not in ("isti'adha", "basmala"):
                        last_good_seg = seg
                        break

                if last_good_seg:
                    # Find trailing audio end from ALL segments after the last good one,
                    # and also include the full audio duration (the tail of the last
                    # word may fade below VAD threshold, e.g. long madd on "الضالين")
                    trailing_end = last_good_seg.time_end
                    for seg in aligned_segments:
                        if seg.segment_idx > last_good_seg.segment_idx:
                            trailing_end = max(trailing_end, seg.time_end)
                    trailing_end = max(trailing_end, audio_duration)

                    # Extend the last segment's ref to include unmatched words
                    last_good_seg.ref_end = self._word_to_ref(self.surah_end)
                    last_good_seg.time_end = trailing_end

                    # Generate word timings for the newly included words
                    if self.enable_word_timings and last_good_seg.word_timings:
                        new_start_time = last_good_seg.word_timings[-1]["end"]
                        new_timings = self._generate_word_timings(
                            new_start_time, trailing_end,
                            pointer, self.surah_end,
                        )
                        last_good_seg.word_timings.extend(new_timings)

                    pointer = self.surah_end + 1
                    logger.info(
                        f"Extended last segment to include trailing words "
                        f"(ref_end={last_good_seg.ref_end}, time_end={trailing_end:.3f}s)"
                    )

        logger.info(
            f"Alignment complete: {total_matched} matched, {total_failed} failed, "
            f"{len(aligned_segments)} total segments"
        )
        return aligned_segments

    def _attempt_fuzzy_reanchor(
        self,
        current_text: str,
        current_pointer: int,
        segment_idx: int,
        vad_segments: list,
        transcriptions: list,
    ) -> Optional[int]:
        """Attempt to re-anchor by searching wider window and using fuzzy matching.

        Args:
            current_text: Current segment's transcribed text
            current_pointer: Current pointer position
            segment_idx: Index of current segment
            vad_segments: All VAD segments
            transcriptions: All transcriptions

        Returns:
            New pointer position if re-anchoring successful, None otherwise
        """
        try:
            from rapidfuzz import fuzz
        except ImportError:
            logger.warning("rapidfuzz not available for fuzzy re-anchoring")
            return None

        # Search a much wider window around current position
        search_radius = 200  # words to search in each direction
        search_start = max(self.surah_start, current_pointer - search_radius)
        search_end = min(self.surah_end, current_pointer + search_radius)

        logger.debug(
            f"Fuzzy re-anchoring: searching window {search_start}-{search_end}"
        )

        # Get reference text in search window
        best_match_score = 0
        best_match_position = None

        # Slide a window across the search range looking for best fuzzy match
        window_size = 10  # words to compare at a time

        for start in range(
            search_start, search_end - window_size, 5
        ):  # Step by 5 for efficiency
            end = min(start + window_size, search_end)
            window_text = self.quran_index.get_text_window(start, end)

            if not window_text:
                continue

            # Calculate fuzzy match score
            score = fuzz.ratio(current_text, window_text)

            if score > best_match_score:
                best_match_score = score
                best_match_position = start

        # Threshold for acceptance
        if best_match_score > 60:  # 60% similarity threshold
            logger.info(
                f"Fuzzy re-anchoring found match at position {best_match_position} "
                f"with score {best_match_score:.1f}%"
            )
            return best_match_position

        logger.debug(
            f"Fuzzy re-anchoring: best match score {best_match_score:.1f}% below threshold"
        )
        return None

    def _try_extend_match_backwards(
        self,
        current_match,
        expected_start: int,
        transcribed_text: str,
        vad_seg,
        segment_idx: int,
    ):
        """Try to extend match backwards to include missing words at the beginning.

        Args:
            current_match: The current successful match
            expected_start: Expected start word index (where we should have started)
            transcribed_text: The transcribed text from ASR
            vad_seg: VAD segment info
            segment_idx: Index of current segment for logging

        Returns:
            Extended match object if successful, None otherwise
        """
        if expected_start >= current_match.start_word:
            return None

        gap_size = current_match.start_word - expected_start

        # Get the missing words text
        missing_text_window = self.quran_index.get_text_window(
            expected_start, current_match.start_word
        )

        if not missing_text_window:
            return None

        logger.debug(
            f"Segment {segment_idx + 1}: Attempting backward extension - "
            f"missing text: '{missing_text_window}'"
        )

        # Try to match the combined text (missing + matched)
        combined_target = missing_text_window + " " + current_match.matched_text

        # Use fuzzy matching to see if the transcribed text contains the missing words
        try:
            from rapidfuzz import fuzz

            # Check if transcribed text contains content similar to missing words
            # We allow for partial match since the ASR might have captured some of it
            combined_score = fuzz.partial_ratio(
                transcribed_text.lower(), combined_target.lower()
            )
            current_score = fuzz.partial_ratio(
                transcribed_text.lower(), current_match.matched_text.lower()
            )

            logger.debug(
                f"Segment {segment_idx + 1}: Backward extension scores - "
                f"combined: {combined_score:.1f}%, current: {current_score:.1f}%"
            )

            # If combined score is significantly better or similar, accept extension
            if combined_score >= current_score - 10:  # Allow 10% tolerance
                extended = ExtendedMatch(
                    start_word=expected_start,
                    end_word=current_match.end_word,
                    matched_text=combined_target,
                    score=min(
                        current_match.score * 0.95, 0.99
                    ),  # Slightly reduce score
                )

                logger.info(
                    f"Segment {segment_idx + 1}: Backward extension accepted "
                    f"(combined score: {combined_score:.1f}%)"
                )
                return extended

        except ImportError:
            logger.debug("rapidfuzz not available for backward extension")

        # Alternative: Check phoneme density to estimate if we have enough audio
        # for the missing words
        segment_duration = vad_seg.end_time - vad_seg.start_time
        expected_phonemes = 0
        for w_idx in range(expected_start, current_match.end_word + 1):
            word_info = self.quran_index.get_word(w_idx)
            if word_info:
                expected_phonemes += len(word_info.phonemes)

        # Rough estimate: ~50-80ms per phoneme on average
        min_expected_duration = expected_phonemes * 0.050  # 50ms per phoneme minimum

        if segment_duration >= min_expected_duration:
            # Audio duration suggests we might have captured the missing words
            # Force extend but with lower confidence
            extended = ExtendedMatch(
                start_word=expected_start,
                end_word=current_match.end_word,
                matched_text=combined_target,
                score=current_match.score
                * 0.85,  # Reduce score more for forced extension
            )

            logger.warning(
                f"Segment {segment_idx + 1}: FORCE backward extension based on duration "
                f"(duration: {segment_duration:.2f}s >= min: {min_expected_duration:.2f}s)"
            )
            return extended

        return None

    def _calculate_timing_adjustments(
        self,
        vad_start: float,
        vad_end: float,
        word_start: int,
        word_end: int,
        expected_start: int,
        gap_detected: bool,
    ) -> Tuple[float, float]:
        """Calculate timing adjustments based on phoneme positions.

        Args:
            vad_start: Original VAD segment start time
            vad_end: Original VAD segment end time
            word_start: Actual matched start word index
            word_end: Actual matched end word index
            expected_start: Expected start word index
            gap_detected: Whether a gap was detected at the beginning

        Returns:
            Tuple of (adjusted_start_time, adjusted_end_time)
        """
        adjusted_start = vad_start
        adjusted_end = vad_end

        # Calculate total phonemes in the expected vs actual range
        total_expected_phonemes = 0
        total_matched_phonemes = 0

        # Count phonemes from expected start to actual start (missing words)
        missing_phonemes = 0
        if gap_detected and expected_start < word_start:
            for w_idx in range(expected_start, word_start):
                word_info = self.quran_index.get_word(w_idx)
                if word_info:
                    missing_phonemes += len(word_info.phonemes)
            total_expected_phonemes += missing_phonemes

        # Count phonemes in matched words
        for w_idx in range(word_start, word_end + 1):
            word_info = self.quran_index.get_word(w_idx)
            if word_info:
                phoneme_count = len(word_info.phonemes)
                total_matched_phonemes += phoneme_count
                total_expected_phonemes += phoneme_count

        # If we have missing words at the beginning, adjust start time backwards
        if gap_detected and missing_phonemes > 0 and total_expected_phonemes > 0:
            segment_duration = vad_end - vad_start

            # Calculate proportion of segment that should be allocated to missing words
            missing_proportion = missing_phonemes / total_expected_phonemes

            # Adjust start time backwards (but not more than 200ms to avoid over-correction)
            time_adjustment = min(missing_proportion * segment_duration, 0.200)
            adjusted_start = vad_start - time_adjustment

            logger.debug(
                f"Timing adjustment: shifted start back by {time_adjustment:.3f}s "
                f"({missing_phonemes} missing phonemes, {missing_proportion:.1%} of segment)"
            )

        # Fine-tune: Check if the first matched word has many phonemes
        # If it does, the VAD might have cut in late
        first_word_info = self.quran_index.get_word(word_start)
        if first_word_info and len(first_word_info.phonemes) >= 4:
            # Long words at the start might need small backward adjustment
            # to capture initial consonants properly
            additional_adjustment = min(0.050, 0.010 * len(first_word_info.phonemes))
            adjusted_start = max(0, adjusted_start - additional_adjustment)

            logger.debug(
                f"Fine-tune: additional {additional_adjustment:.3f}s adjustment for "
                f"long first word '{first_word_info.text}' ({len(first_word_info.phonemes)} phonemes)"
            )

        # Apply bounds checking
        adjusted_start = max(0, adjusted_start)
        adjusted_end = max(
            adjusted_start + 0.100, adjusted_end
        )  # Minimum 100ms segment

        return round(adjusted_start, 3), round(adjusted_end, 3)

    def _word_to_ref(self, word_idx: int) -> str:
        """Convert global word index to reference string."""
        word_info = self.quran_index.get_word(word_idx)
        if word_info:
            return f"{word_info.surah}:{word_info.ayah}:{word_info.word}"
        return ""

    def _generate_word_timings(
        self, time_start: float, time_end: float, word_start: int, word_end: int
    ) -> List[Dict]:
        """Generate word-level timings.

        Distributes time proportionally across words based on phoneme count.
        """
        total_duration = time_end - time_start
        num_words = word_end - word_start + 1

        if num_words <= 0:
            return []

        # Calculate phoneme count per word for proportional distribution
        word_phoneme_counts = []
        for i in range(word_start, word_end + 1):
            word_info = self.quran_index.get_word(i)
            if word_info:
                word_phoneme_counts.append(len(word_info.phonemes))
            else:
                word_phoneme_counts.append(1)

        total_phonemes = sum(word_phoneme_counts)

        if total_phonemes == 0:
            # Uniform distribution
            word_duration = total_duration / num_words
            result = []
            for i in range(num_words):
                word_info = self.quran_index.get_word(word_start + i)
                word_text = word_info.text if word_info else ""
                word_ref = (
                    f"{word_info.surah}:{word_info.ayah}:{word_info.word}"
                    if word_info
                    else ""
                )
                result.append(
                    {
                        "word": word_text,
                        "word_ref": word_ref,
                        "start": round(time_start + i * word_duration, 3),
                        "end": round(time_start + (i + 1) * word_duration, 3),
                    }
                )
            return result

        # Proportional distribution by phoneme count
        timings = []
        current_time = time_start

        for i, phoneme_count in enumerate(word_phoneme_counts):
            word_duration = (phoneme_count / total_phonemes) * total_duration
            word_info = self.quran_index.get_word(word_start + i)
            word_ref = (
                f"{word_info.surah}:{word_info.ayah}:{word_info.word}"
                if word_info
                else ""
            )

            timings.append(
                {
                    "word": word_info.text if word_info else "",
                    "word_ref": word_ref,
                    "start": round(current_time, 3),
                    "end": round(current_time + word_duration, 3),
                }
            )

            current_time += word_duration

        return timings

    def convert_to_ayah_timings(self, aligned_segments: List[AlignedSegment]) -> Dict:
        """Convert segment alignments to ayah-level timings.

        Args:
            aligned_segments: List of aligned segments

        Returns:
            Dictionary with surah info and ayah timings
        """
        # First pass: Collect all word-level timings and organize by ayah
        ayah_word_timings = {}  # ayah_num -> list of word timings
        special_segments = []  # Track special segments separately

        for segment in aligned_segments:
            if segment.error:
                continue

            # Check if this is a special segment (Isti'adha or Basmala)
            if segment.ref_start in ("isti'adha", "basmala"):
                special_segments.append(
                    {
                        "type": segment.ref_start,
                        "text": segment.matched_text,
                        "start_time": round(segment.time_start, 3),
                        "end_time": round(segment.time_end, 3),
                    }
                )
                continue

            # Parse ref_start and ref_end for Quran segments
            try:
                parts = segment.ref_start.split(":")
                start_ayah = int(parts[1])

                parts = segment.ref_end.split(":")
                end_ayah = int(parts[1])
            except (ValueError, IndexError):
                continue

            # Collect word timings organized by ayah
            for wt in segment.word_timings:
                # Parse word reference to get ayah number
                word_ref = wt.get("word_ref", "")
                if word_ref:
                    try:
                        wt_ayah = int(word_ref.split(":")[1])
                    except (ValueError, IndexError):
                        continue
                else:
                    # Fallback: infer ayah from position in segment
                    wt_ayah = start_ayah

                if wt_ayah not in ayah_word_timings:
                    ayah_word_timings[wt_ayah] = []
                ayah_word_timings[wt_ayah].append(wt)

        # Second pass: Build ayah timings from word-level data
        ayah_timings = {}

        for ayah_num, word_timings in ayah_word_timings.items():
            if not word_timings:
                continue

            # Sort word timings by start time
            word_timings.sort(key=lambda x: x.get("start", 0))

            # Calculate ayah timing from word timings
            start_time = word_timings[0].get("start", 0)
            end_time = word_timings[-1].get("end", 0)

            ayah_timings[ayah_num] = {
                "start": start_time,
                "end": end_time,
                "word_timings": word_timings,
            }

        # Third pass: Handle multi-ayah segments that didn't have word-level data
        # This ensures segments spanning multiple ayahs get proper timing splits
        for segment in aligned_segments:
            if segment.error:
                continue

            if segment.ref_start in ("isti'adha", "basmala"):
                continue

            try:
                parts = segment.ref_start.split(":")
                start_ayah = int(parts[1])

                parts = segment.ref_end.split(":")
                end_ayah = int(parts[1])
            except (ValueError, IndexError):
                continue

            # If segment spans multiple ayahs and we don't have word timings for them
            if end_ayah > start_ayah:
                segment_duration = segment.time_end - segment.time_start

                # Use gap-based boundary detection instead of proportional distribution
                # Collect all word timings from this segment
                segment_words = []
                for wt in segment.word_timings:
                    word_ref = wt.get("word_ref", "")
                    if word_ref:
                        try:
                            wt_ayah = int(word_ref.split(":")[1])
                            segment_words.append(
                                {
                                    "ayah": wt_ayah,
                                    "start": wt.get("start", 0),
                                    "end": wt.get("end", 0),
                                    "word": wt.get("word", ""),
                                }
                            )
                        except (ValueError, IndexError):
                            continue

                if len(segment_words) >= 2:
                    # Sort by time
                    segment_words.sort(key=lambda x: x["start"])

                    # Detect gaps between consecutive words
                    GAP_THRESHOLD = 0.3  # 300ms gap indicates ayah boundary
                    ayah_boundaries = []

                    for i in range(len(segment_words) - 1):
                        gap = segment_words[i + 1]["start"] - segment_words[i]["end"]
                        if gap > GAP_THRESHOLD:
                            # Potential ayah boundary at segment_words[i]["end"]
                            ayah_boundaries.append(
                                {
                                    "time": segment_words[i]["end"]
                                    + gap / 2,  # Midpoint of gap
                                    "after_word_idx": i,
                                    "gap_size": gap,
                                }
                            )

                    # Assign timing to each ayah based on detected boundaries
                    current_idx = 0
                    for ayah_num in range(start_ayah, end_ayah + 1):
                        # Find words for this ayah
                        ayah_words = [w for w in segment_words if w["ayah"] == ayah_num]

                        if ayah_words:
                            if ayah_num not in ayah_timings:
                                # Determine start and end based on words
                                ayah_start = ayah_words[0]["start"]
                                ayah_end = ayah_words[-1]["end"]

                                # Check if there's a detected boundary affecting this ayah
                                for boundary in ayah_boundaries:
                                    if (
                                        current_idx
                                        <= boundary["after_word_idx"]
                                        < current_idx + len(ayah_words)
                                    ):
                                        # Boundary is within this ayah - use it as end time
                                        ayah_end = boundary["time"]
                                        break

                                ayah_timings[ayah_num] = {
                                    "start": ayah_start,
                                    "end": ayah_end,
                                    "word_timings": [],
                                }
                            else:
                                # Merge with existing timing
                                existing = ayah_timings[ayah_num]
                                existing["start"] = min(
                                    existing["start"], ayah_words[0]["start"]
                                )
                                existing["end"] = max(
                                    existing["end"], ayah_words[-1]["end"]
                                )

                            current_idx += len(ayah_words)
                else:
                    # Fallback if we can't do gap detection - fail loud
                    logger.warning(
                        f"Multi-ayah segment ({start_ayah}-{end_ayah}) has insufficient "
                        f"word data for gap-based boundary detection ({len(segment_words)} words). "
                        f"Using VAD segment boundaries directly."
                    )

                    # Use segment boundaries for first and last ayah
                    word_counts = {}
                    for wt in segment.word_timings:
                        ref = wt.get("word_ref", "")
                        if ref:
                            try:
                                ayah = int(ref.split(":")[1])
                                word_counts[ayah] = word_counts.get(ayah, 0) + 1
                            except:
                                pass

                    if word_counts:
                        min_ayah = min(word_counts.keys())
                        max_ayah = max(word_counts.keys())

                        for ayah_num in range(start_ayah, end_ayah + 1):
                            if ayah_num not in ayah_timings:
                                if ayah_num == min_ayah:
                                    # First ayah - use segment start
                                    ayah_timings[ayah_num] = {
                                        "start": segment.time_start,
                                        "end": segment.time_end,  # Will be adjusted later
                                        "word_timings": [],
                                    }
                                elif ayah_num == max_ayah:
                                    # Last ayah - use segment end
                                    ayah_timings[ayah_num] = {
                                        "start": segment.time_start,  # Will be adjusted
                                        "end": segment.time_end,
                                        "word_timings": [],
                                    }

        # Fourth pass: Detect and fix overlaps
        ayah_timings = self._fix_ayah_timing_overlaps(ayah_timings)

        # Fifth pass: Validate and fix suspicious ayah durations
        ayah_timings = self._validate_ayah_durations(ayah_timings, aligned_segments)

        # Build output JSON structure
        ayahs = []
        for ayah_num in sorted(ayah_timings.keys()):
            timing = ayah_timings[ayah_num]

            # Get ayah text
            start, end = self.quran_index.get_ayah_range(self.surah_number, ayah_num)
            ayah_text = self.quran_index.get_text_window(start, end)

            ayahs.append(
                {
                    "aya_no": ayah_num,
                    "aya_text": ayah_text,
                    "start_time": round(timing["start"], 3),
                    "end_time": round(timing["end"], 3),
                    "word_timings": timing["word_timings"],
                }
            )

        result = {
            "surah_no": self.surah_number,
            "surah_name_en": self._get_surah_name_en(),
            "surah_name_ar": self._get_surah_name_ar(),
            "ayah_count": len(ayahs),
            "ayahs": ayahs,
        }

        # Add special segments if any were detected
        if special_segments:
            result["special_segments"] = special_segments

        return result

    def _validate_ayah_durations(
        self, ayah_timings: Dict, aligned_segments: List[AlignedSegment]
    ) -> Dict:
        """Validate ayah durations and fix suspiciously long/short timings.

        Detects ayahs that are abnormally long (>30s) or short (<2s) and attempts
        to re-adjust boundaries based on word timing gaps.

        Args:
            ayah_timings: Dictionary of ayah_num -> timing info
            aligned_segments: List of aligned segments for reference

        Returns:
            Validated ayah timings dictionary
        """
        if not ayah_timings:
            return ayah_timings

        MIN_NORMAL_DURATION = 2.0  # Minimum normal ayah duration
        MAX_NORMAL_DURATION = 30.0  # Maximum normal ayah duration (for non-long ayahs)
        SUSPICIOUS_RATIO = 1.5  # Ratio to detect abnormal durations

        sorted_ayahs = sorted(ayah_timings.keys())
        adjustments_made = []

        for i, ayah_num in enumerate(sorted_ayahs):
            timing = ayah_timings[ayah_num]
            duration = timing["end"] - timing["start"]
            word_count = len(timing.get("word_timings", []))

            # Skip if no words or reasonable duration
            if word_count == 0:
                continue

            avg_word_duration = duration / word_count if word_count > 0 else 0

            # Check for suspiciously LONG ayah
            if duration > MAX_NORMAL_DURATION and avg_word_duration > 2.0:
                logger.warning(
                    f"Ayah {ayah_num}: Suspiciously LONG duration "
                    f"({duration:.1f}s, {word_count} words, {avg_word_duration:.1f}s/word)"
                )

                # Check if words belong to different ayahs (indicates mis-assignment)
                word_timings = timing.get("word_timings", [])
                ayahs_in_words = set()
                for wt in word_timings:
                    ref = wt.get("word_ref", "")
                    if ref:
                        try:
                            ayah_from_ref = int(ref.split(":")[1])
                            ayahs_in_words.add(ayah_from_ref)
                        except:
                            pass

                # Only try to fix if words from multiple ayahs are mixed together
                if len(ayahs_in_words) > 1:
                    logger.info(
                        f"Ayah {ayah_num}: Mixed ayahs detected in words: {sorted(ayahs_in_words)}"
                    )

                    if len(word_timings) >= 2:
                        # Find gaps that are abnormally large (>1.0s and >3x average word duration)
                        avg_word_dur = duration / word_count if word_count > 0 else 1.0
                        significant_gaps = []

                        for j in range(len(word_timings) - 1):
                            gap = word_timings[j + 1]["start"] - word_timings[j]["end"]
                            # Gap must be >1.0s AND >3x average word duration
                            if gap > 1.0 and gap > (avg_word_dur * 3):
                                significant_gaps.append(
                                    {
                                        "idx": j,
                                        "gap": gap,
                                        "ratio": gap / avg_word_dur
                                        if avg_word_dur > 0
                                        else 0,
                                    }
                                )

                        # Sort by gap size (largest first)
                        significant_gaps.sort(key=lambda x: x["gap"], reverse=True)

                        # Check if next ayah exists and is suspiciously short
                        if significant_gaps and i + 1 < len(sorted_ayahs):
                            next_ayah_num = sorted_ayahs[i + 1]
                            next_timing = ayah_timings[next_ayah_num]
                            next_duration = next_timing["end"] - next_timing["start"]
                            next_word_count = len(next_timing.get("word_timings", []))

                            # Only adjust if next ayah is suspiciously short
                            next_is_short = next_duration < 5.0 or (
                                next_word_count > 3
                                and next_duration / next_word_count < 1.5
                            )

                            if next_is_short:
                                # Use the largest significant gap
                                best_gap = significant_gaps[0]
                                max_gap_idx = best_gap["idx"]
                                max_gap = best_gap["gap"]

                                logger.info(
                                    f"Ayah {ayah_num}: Found significant gap ({max_gap:.2f}s, "
                                    f"{best_gap['ratio']:.1f}x avg) at word {max_gap_idx + 1}, "
                                    f"next ayah {next_ayah_num} is short ({next_duration:.1f}s)"
                                )

                                # Calculate new boundary at midpoint of gap
                                new_boundary = (
                                    word_timings[max_gap_idx]["end"]
                                    + word_timings[max_gap_idx + 1]["start"]
                                ) / 2

                                old_end = timing["end"]

                                # Only adjust if it makes sense
                                if new_boundary < old_end:
                                    timing["end"] = new_boundary
                                    next_timing["start"] = new_boundary

                                    adjustments_made.append(
                                        {
                                            "ayah": ayah_num,
                                            "action": "shortened",
                                            "old_duration": duration,
                                            "new_duration": new_boundary
                                            - timing["start"],
                                            "boundary_shift": new_boundary - old_end,
                                        }
                                    )

                                    logger.info(
                                        f"Ayah {ayah_num}: Adjusted end from {old_end:.3f}s to "
                                        f"{new_boundary:.3f}s (moved -{old_end - new_boundary:.3f}s to ayah {next_ayah_num})"
                                    )
                else:
                    # All words belong to same ayah - don't modify timing
                    logger.info(
                        f"Ayah {ayah_num}: All {word_count} words belong to same ayah "
                        f"(refs: {sorted(ayahs_in_words)}), keeping original timing"
                    )
                    # Skip gap-based adjustment when all words belong to same ayah
                    continue

                # Look for gaps in word timings to split
                word_timings = timing.get("word_timings", [])
                if len(word_timings) >= 2:
                    # Find gaps that are abnormally large (>1.0s and >3x average word duration)
                    avg_word_dur = duration / word_count if word_count > 0 else 1.0
                    significant_gaps = []

                    for j in range(len(word_timings) - 1):
                        gap = word_timings[j + 1]["start"] - word_timings[j]["end"]
                        # Gap must be >1.0s AND >3x average word duration
                        if gap > 1.0 and gap > (avg_word_dur * 3):
                            significant_gaps.append(
                                {
                                    "idx": j,
                                    "gap": gap,
                                    "ratio": gap / avg_word_dur
                                    if avg_word_dur > 0
                                    else 0,
                                }
                            )

                    # Sort by gap size (largest first)
                    significant_gaps.sort(key=lambda x: x["gap"], reverse=True)

                    # Check if next ayah exists and is suspiciously short
                    if significant_gaps and i + 1 < len(sorted_ayahs):
                        next_ayah_num = sorted_ayahs[i + 1]
                        next_timing = ayah_timings[next_ayah_num]
                        next_duration = next_timing["end"] - next_timing["start"]
                        next_word_count = len(next_timing.get("word_timings", []))

                        # Only adjust if next ayah is suspiciously short (<5s or <10 words with short duration)
                        next_is_short = next_duration < 5.0 or (
                            next_word_count > 3
                            and next_duration / next_word_count < 1.5
                        )

                        if next_is_short:
                            # Use the largest significant gap
                            best_gap = significant_gaps[0]
                            max_gap_idx = best_gap["idx"]
                            max_gap = best_gap["gap"]

                            logger.info(
                                f"Ayah {ayah_num}: Found significant gap ({max_gap:.2f}s, "
                                f"{best_gap['ratio']:.1f}x avg) at word {max_gap_idx + 1}, "
                                f"next ayah {next_ayah_num} is short ({next_duration:.1f}s)"
                            )

                            # Calculate new boundary at midpoint of gap
                            new_boundary = (
                                word_timings[max_gap_idx]["end"]
                                + word_timings[max_gap_idx + 1]["start"]
                            ) / 2

                            old_end = timing["end"]

                            # Only adjust if it makes sense (new boundary is before old end)
                            if new_boundary < old_end:
                                timing["end"] = new_boundary
                                next_timing["start"] = new_boundary

                                adjustments_made.append(
                                    {
                                        "ayah": ayah_num,
                                        "action": "shortened",
                                        "old_duration": duration,
                                        "new_duration": new_boundary - timing["start"],
                                        "boundary_shift": new_boundary - old_end,
                                    }
                                )

                                logger.info(
                                    f"Ayah {ayah_num}: Adjusted end from {old_end:.3f}s to "
                                    f"{new_boundary:.3f}s (moved -{old_end - new_boundary:.3f}s to ayah {next_ayah_num})"
                                )

                # Look for gaps in word timings to split
                word_timings = timing.get("word_timings", [])
                if len(word_timings) >= 2:
                    # Find largest gap between consecutive words
                    max_gap = 0
                    max_gap_idx = -1

                    for j in range(len(word_timings) - 1):
                        gap = word_timings[j + 1]["start"] - word_timings[j]["end"]
                        if gap > max_gap:
                            max_gap = gap
                            max_gap_idx = j

                    # If large gap found (>0.5s), this might indicate mis-merged ayahs
                    if max_gap > 0.5:
                        logger.info(
                            f"Ayah {ayah_num}: Found large gap ({max_gap:.2f}s) at word "
                            f"{max_gap_idx + 1}, suggesting boundary error"
                        )

                        # Check if next ayah exists and is suspiciously short
                        if i + 1 < len(sorted_ayahs):
                            next_ayah_num = sorted_ayahs[i + 1]
                            next_timing = ayah_timings[next_ayah_num]
                            next_duration = next_timing["end"] - next_timing["start"]

                            if next_duration < MIN_NORMAL_DURATION:
                                # This is likely the issue - reallocate time
                                new_boundary = (
                                    word_timings[max_gap_idx]["end"]
                                    + word_timings[max_gap_idx + 1]["start"]
                                ) / 2

                                old_end = timing["end"]
                                old_next_start = next_timing["start"]

                                timing["end"] = new_boundary
                                next_timing["start"] = new_boundary

                                adjustments_made.append(
                                    {
                                        "ayah": ayah_num,
                                        "action": "shortened",
                                        "old_duration": duration,
                                        "new_duration": new_boundary - timing["start"],
                                        "boundary_shift": new_boundary - old_end,
                                    }
                                )

                                logger.info(
                                    f"Ayah {ayah_num}: Adjusted end from {old_end:.3f}s to "
                                    f"{new_boundary:.3f}s (moved -{old_end - new_boundary:.3f}s to ayah {next_ayah_num})"
                                )

            # Check for suspiciously SHORT ayah (only if previous ayah is long)
            elif duration < MIN_NORMAL_DURATION and i > 0:
                prev_ayah_num = sorted_ayahs[i - 1]
                prev_timing = ayah_timings[prev_ayah_num]
                prev_duration = prev_timing["end"] - prev_timing["start"]

                if prev_duration > MAX_NORMAL_DURATION:
                    # Previous ayah might have stolen time from this one
                    # Look for words that belong to this ayah but are in prev_ayah's word_timings
                    logger.warning(
                        f"Ayah {ayah_num}: Suspiciously SHORT duration "
                        f"({duration:.1f}s) after long ayah {prev_ayah_num} "
                        f"({prev_duration:.1f}s)"
                    )

        if adjustments_made:
            logger.info(f"Made {len(adjustments_made)} ayah duration adjustments")
            for adj in adjustments_made:
                logger.info(f"  - Ayah {adj['ayah']}: {adj['action']}")

        return ayah_timings

    def _fix_ayah_timing_overlaps(self, ayah_timings: Dict) -> Dict:
        """Detect and fix overlapping ayah timings.

        Ensures each ayah has unique timing and no gaps/overlaps between consecutive ayahs.

        Args:
            ayah_timings: Dictionary of ayah_num -> timing info

        Returns:
            Fixed ayah timings dictionary
        """
        if not ayah_timings:
            return ayah_timings

        # Sort ayahs by number
        sorted_ayahs = sorted(ayah_timings.keys())

        # Check for duplicates (same start and end times)
        timing_signatures = {}
        for ayah_num in sorted_ayahs:
            timing = ayah_timings[ayah_num]
            signature = (round(timing["start"], 3), round(timing["end"], 3))

            if signature in timing_signatures:
                # Found duplicate timing - need to split
                duplicate_ayah = timing_signatures[signature]
                logger.warning(
                    f"Duplicate timing detected: Ayah {ayah_num} and Ayah {duplicate_ayah} "
                    f"both have timing {signature[0]:.3f}s - {signature[1]:.3f}s"
                )

                # Split the timing between the two ayahs
                duration = signature[1] - signature[0]
                mid_point = signature[0] + (duration / 2)

                # Adjust both ayahs
                ayah_timings[duplicate_ayah]["end"] = mid_point - 0.001  # Small gap
                ayah_timings[ayah_num]["start"] = mid_point

                # Update signature for duplicate
                new_sig = (
                    round(ayah_timings[duplicate_ayah]["start"], 3),
                    round(ayah_timings[duplicate_ayah]["end"], 3),
                )
                timing_signatures[new_sig] = duplicate_ayah

                # Add new signature for current ayah
                new_sig = (
                    round(ayah_timings[ayah_num]["start"], 3),
                    round(ayah_timings[ayah_num]["end"], 3),
                )
                timing_signatures[new_sig] = ayah_num
            else:
                timing_signatures[signature] = ayah_num

        # Ensure continuous timing between consecutive ayahs
        for i in range(len(sorted_ayahs) - 1):
            current_ayah = sorted_ayahs[i]
            next_ayah = sorted_ayahs[i + 1]

            current_end = ayah_timings[current_ayah]["end"]
            next_start = ayah_timings[next_ayah]["start"]

            # Check for overlap
            if next_start < current_end:
                # Overlap detected - split the difference
                mid_point = (current_end + next_start) / 2
                ayah_timings[current_ayah]["end"] = mid_point - 0.001
                ayah_timings[next_ayah]["start"] = mid_point + 0.001
                logger.debug(
                    f"Fixed overlap between Ayah {current_ayah} and {next_ayah}: "
                    f"midpoint at {mid_point:.3f}s"
                )

            # Check for gap (more than 50ms)
            elif next_start > current_end + 0.050:
                # Small gap - close it by extending current ayah's end
                ayah_timings[current_ayah]["end"] = next_start - 0.001
                logger.debug(f"Closed gap between Ayah {current_ayah} and {next_ayah}")

            # Ensure next ayah starts right after current ends (with small gap)
            else:
                ayah_timings[next_ayah]["start"] = current_end + 0.001

        return ayah_timings

    def _get_surah_name_en(self) -> str:
        """Get English name of surah."""
        word = self.quran_index.get_word(self.surah_start)
        return word.sura_name_en if word else ""

    def _get_surah_name_ar(self) -> str:
        """Get Arabic name of surah."""
        word = self.quran_index.get_word(self.surah_start)
        return word.sura_name_ar if word else ""
