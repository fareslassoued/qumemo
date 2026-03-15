#!/usr/bin/env python3
"""Validate alignment output JSONs against QaloonData source of truth.

Checks:
  1. Ayah count matches, no gaps or duplicates
  2. First word of each ayah matches QaloonData
  3. Special segments ordering (basmala/isti'adha before ayah 1)

Usage:
    python3 validate_timings.py
"""

import json
import re
import sys
from pathlib import Path


SCRIPT_DIR = Path(__file__).parent
OUTPUT_DIR = SCRIPT_DIR / "output"
QALOON_DATA_PATH = (
    SCRIPT_DIR.parent.parent / "src" / "data" / "quran" / "QaloonData_v10.json"
)


def strip_ayah_marker(text: str) -> str:
    """Remove trailing Arabic-Indic numeral from ayah text."""
    return re.sub(r"\s+[٠١٢٣٤٥٦٧٨٩]+$", "", text.strip())


def first_word(text: str) -> str:
    """Get first word of ayah text after stripping marker."""
    cleaned = strip_ayah_marker(text)
    words = cleaned.split()
    return words[0] if words else ""


def load_quran_data() -> dict:
    """Load QaloonData and build {sura_no: [{aya_no, first_word, total_ayahs}]} lookup."""
    with open(QALOON_DATA_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    surahs = {}
    for entry in data:
        sura_no = entry["sura_no"]
        if sura_no not in surahs:
            surahs[sura_no] = []
        surahs[sura_no].append(
            {
                "aya_no": entry["aya_no"],
                "first_word": first_word(entry["aya_text"]),
            }
        )
    return surahs


def validate_surah(timing_path: Path, quran_surahs: dict) -> list[str]:
    """Validate a single surah timing JSON. Returns list of error strings."""
    errors = []

    with open(timing_path, "r", encoding="utf-8") as f:
        timing = json.load(f)

    surah_no = timing["surah_no"]
    expected = quran_surahs.get(surah_no)
    if expected is None:
        errors.append(f"Unknown surah number {surah_no}")
        return errors

    ayahs = timing["ayahs"]
    expected_count = len(expected)

    # --- Check 1: Ayah count match ---
    if timing["ayah_count"] != expected_count:
        errors.append(
            f"ayah_count mismatch: JSON says {timing['ayah_count']}, "
            f"QaloonData has {expected_count}"
        )

    actual_count = len(ayahs)
    if actual_count != expected_count:
        errors.append(
            f"actual ayah entries: {actual_count}, expected: {expected_count}"
        )

    # Check for gaps and duplicates
    actual_nums = [a["aya_no"] for a in ayahs]
    expected_nums = list(range(1, expected_count + 1))

    duplicates = set()
    seen = set()
    for n in actual_nums:
        if n in seen:
            duplicates.add(n)
        seen.add(n)
    if duplicates:
        errors.append(f"duplicate ayah numbers: {sorted(duplicates)}")

    missing = set(expected_nums) - seen
    if missing:
        errors.append(f"missing ayah numbers: {sorted(missing)}")

    extra = seen - set(expected_nums)
    if extra:
        errors.append(f"unexpected ayah numbers: {sorted(extra)}")

    # --- Check 2: First word match ---
    expected_by_num = {e["aya_no"]: e["first_word"] for e in expected}
    for ayah in ayahs:
        aya_no = ayah["aya_no"]
        exp_first = expected_by_num.get(aya_no)
        if exp_first is None:
            continue  # already reported as extra

        wt = ayah.get("word_timings", [])
        if not wt:
            errors.append(f"ayah {aya_no}: no word_timings")
            continue

        actual_word = wt[0]["word"]
        if actual_word != exp_first:
            errors.append(
                f"ayah {aya_no}: first word mismatch — "
                f"timing has '{actual_word}', QaloonData has '{exp_first}'"
            )

        # Check word_ref format
        word_ref = wt[0].get("word_ref", "")
        expected_prefix = f"{surah_no}:{aya_no}:1"
        if word_ref != expected_prefix:
            errors.append(
                f"ayah {aya_no}: word_ref '{word_ref}' != expected '{expected_prefix}'"
            )

    # --- Check 3: Special segments ordering ---
    special = timing.get("special_segments", [])
    if not special:
        errors.append("no special_segments found")
    else:
        seg_types = [s["type"] for s in special]

        if surah_no == 1:
            # Al-Fatiha: expects both isti'adha and basmala
            if "isti'adha" not in seg_types:
                errors.append("surah 1: missing isti'adha in special_segments")
            if "basmala" not in seg_types:
                errors.append("surah 1: missing basmala in special_segments")
        elif surah_no == 9:
            # At-Tawbah: isti'adha only, no basmala
            if "isti'adha" not in seg_types:
                errors.append("surah 9: missing isti'adha in special_segments")
            if "basmala" in seg_types:
                errors.append("surah 9: should NOT have basmala")
        else:
            # All others: at least basmala
            if "basmala" not in seg_types:
                errors.append(f"missing basmala in special_segments")

        # Check ordering: last special segment ends before first ayah starts
        if ayahs:
            last_seg_end = special[-1]["end_time"]
            first_ayah_start = ayahs[0]["start_time"]
            if last_seg_end >= first_ayah_start:
                errors.append(
                    f"special_segments overlap: last segment ends at "
                    f"{last_seg_end:.3f}s but first ayah starts at "
                    f"{first_ayah_start:.3f}s"
                )

    return errors


def main():
    if not QALOON_DATA_PATH.exists():
        print(f"ERROR: QaloonData not found at {QALOON_DATA_PATH}")
        sys.exit(1)

    quran_surahs = load_quran_data()

    timing_files = sorted(OUTPUT_DIR.glob("*_timings.json"))
    if not timing_files:
        print(f"ERROR: No timing files found in {OUTPUT_DIR}")
        sys.exit(1)

    total = 0
    passed = 0
    failed = 0
    all_failures = []

    for timing_path in timing_files:
        total += 1
        surah_num = timing_path.stem.split("_")[0]  # "001" from "001_timings.json"

        errors = validate_surah(timing_path, quran_surahs)

        if errors:
            failed += 1
            print(f"FAIL  Surah {surah_num}")
            for err in errors:
                print(f"      - {err}")
            all_failures.append((surah_num, errors))
        else:
            passed += 1
            print(f"PASS  Surah {surah_num}")

    # Summary
    print()
    print(f"{'=' * 50}")
    print(f"Total: {total}  |  Passed: {passed}  |  Failed: {failed}")

    if all_failures:
        print()
        print("Failing surahs:")
        for surah_num, errors in all_failures:
            print(f"  Surah {surah_num}: {len(errors)} error(s)")
        print()
        sys.exit(1)
    else:
        print("All surahs passed validation.")
        sys.exit(0)


if __name__ == "__main__":
    main()
