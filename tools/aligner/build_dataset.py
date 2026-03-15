#!/usr/bin/env python3
"""Build a HuggingFace dataset from alignment output.

Reads timing JSONs + surah MP3s, slices per-ayah audio clips,
and produces a HuggingFace Dataset in standard ASR format.

Usage:
    # Save to disk (all surahs)
    uv run --extra cuda python build_dataset.py --output-dir dataset/

    # Save specific surahs
    uv run --extra cuda python build_dataset.py --surahs 1 --output-dir dataset/
    uv run --extra cuda python build_dataset.py --surahs 1-10 --output-dir dataset/

    # Push to HuggingFace Hub (private repo)
    uv run --extra cuda python build_dataset.py --surahs 1 --push-to-hub user/dataset --private

    # Push all surahs
    uv run --extra cuda python build_dataset.py --push-to-hub user/dataset
"""

import argparse
import json
import logging
import sys
from io import BytesIO
from pathlib import Path

from pydub import AudioSegment
from tqdm import tqdm

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

TIMINGS_DIR = Path(__file__).parent / "output"
MP3_DIR = Path(__file__).parent / "cache" / "mp3"


def parse_surahs(args: list[str]) -> list[int]:
    """Parse --surahs argument into a list of surah numbers.

    Supports: 'all', single number, range ('1-10'), space-separated list.
    """
    if not args:
        return list(range(1, 115))

    if args[0] == "all":
        return list(range(1, 115))

    surahs = []
    for arg in args:
        if "-" in arg:
            parts = arg.split("-")
            start, end = int(parts[0]), int(parts[1])
            surahs.extend(range(start, end + 1))
        else:
            surahs.append(int(arg))

    # Validate
    for s in surahs:
        if not 1 <= s <= 114:
            raise ValueError(f"Invalid surah number: {s}")

    return sorted(set(surahs))


def load_timings(timings_dir: Path) -> list[dict]:
    """Load all timing JSON files, sorted by surah number."""
    files = sorted(timings_dir.glob("*_timings.json"))
    if not files:
        logger.error(f"No timing files found in {timings_dir}")
        sys.exit(1)

    timings = []
    for f in files:
        with open(f, "r", encoding="utf-8") as fh:
            data = json.load(fh)
            timings.append(data)
            logger.info(
                f"Loaded {f.name}: Surah {data['surah_no']} "
                f"({data['ayah_count']} ayahs)"
            )

    logger.info(f"Loaded {len(timings)} timing files")
    return timings


def slice_ayah_audio(
    mp3_path: Path, start_ms: int, end_ms: int
) -> bytes:
    """Slice audio segment and return as WAV bytes."""
    audio = AudioSegment.from_mp3(str(mp3_path))
    clip = audio[start_ms:end_ms]

    buf = BytesIO()
    clip.export(buf, format="wav")
    return buf.getvalue()


def build_dataset_rows(
    timings: list[dict],
    mp3_dir: Path,
) -> list[dict]:
    """Build dataset rows from timing data and audio files."""
    rows = []
    missing_audio = []

    for surah_data in tqdm(timings, desc="Processing surahs"):
        surah_no = surah_data["surah_no"]
        surah_name_en = surah_data.get("surah_name_en", "")
        surah_name_ar = surah_data.get("surah_name_ar", "")

        mp3_path = mp3_dir / f"{surah_no:03d}.mp3"
        if not mp3_path.exists():
            logger.warning(f"Missing audio for Surah {surah_no}: {mp3_path}")
            missing_audio.append(surah_no)
            continue

        # Load full surah audio once
        full_audio = AudioSegment.from_mp3(str(mp3_path))

        for ayah in surah_data["ayahs"]:
            ayah_no = ayah["aya_no"]
            start_ms = int(ayah["start_time"] * 1000)
            end_ms = int(ayah["end_time"] * 1000)

            # Clamp to audio bounds
            start_ms = max(0, start_ms)
            end_ms = min(len(full_audio), end_ms)

            if end_ms <= start_ms:
                logger.warning(
                    f"Surah {surah_no} Ayah {ayah_no}: "
                    f"invalid timing ({start_ms}ms-{end_ms}ms), skipping"
                )
                continue

            # Slice audio
            clip = full_audio[start_ms:end_ms]
            buf = BytesIO()
            clip.export(buf, format="wav")
            audio_bytes = buf.getvalue()

            # Serialize word timings relative to clip start
            word_timings = ayah.get("word_timings", [])
            relative_word_timings = []
            clip_start_s = ayah["start_time"]
            for wt in word_timings:
                relative_word_timings.append({
                    "word": wt.get("word", ""),
                    "word_ref": wt.get("word_ref", ""),
                    "start": round(wt.get("start", 0) - clip_start_s, 3),
                    "end": round(wt.get("end", 0) - clip_start_s, 3),
                })

            rows.append({
                "surah": surah_no,
                "ayah": ayah_no,
                "audio": {"bytes": audio_bytes, "path": f"{surah_no:03d}_{ayah_no:03d}.wav"},
                "text": ayah.get("aya_text", ""),
                "surah_name_en": surah_name_en,
                "surah_name_ar": surah_name_ar,
                "word_timings": json.dumps(relative_word_timings, ensure_ascii=False),
            })

    if missing_audio:
        logger.warning(
            f"Missing audio for {len(missing_audio)} surahs: {missing_audio}"
        )

    logger.info(f"Built {len(rows)} dataset rows")
    return rows


def main():
    parser = argparse.ArgumentParser(
        description="Build HuggingFace dataset from alignment timings"
    )
    parser.add_argument(
        "--timings-dir",
        type=str,
        default=str(TIMINGS_DIR),
        help="Directory containing *_timings.json files",
    )
    parser.add_argument(
        "--mp3-dir",
        type=str,
        default=str(MP3_DIR),
        help="Directory containing surah MP3 files",
    )
    parser.add_argument(
        "--surahs",
        nargs="+",
        default=["all"],
        help="Surahs to include: 'all', number, range '1-10', or list '1 2 36'",
    )
    parser.add_argument(
        "--private",
        action="store_true",
        help="Create as private repo on first push to Hub",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        help="Save dataset to this directory (save_to_disk)",
    )
    parser.add_argument(
        "--push-to-hub",
        type=str,
        help="Push dataset to HuggingFace Hub (e.g. username/dataset-name)",
    )
    args = parser.parse_args()

    if not args.output_dir and not args.push_to_hub:
        parser.error("Specify --output-dir and/or --push-to-hub")

    timings_dir = Path(args.timings_dir)
    mp3_dir = Path(args.mp3_dir)

    # Load and filter timings
    timings = load_timings(timings_dir)
    surah_set = set(parse_surahs(args.surahs))
    timings = [t for t in timings if t["surah_no"] in surah_set]
    logger.info(f"Filtered to {len(timings)} surahs: {sorted(t['surah_no'] for t in timings)}")

    if not timings:
        logger.error("No timings match the requested surahs")
        sys.exit(1)

    # Build rows
    rows = build_dataset_rows(timings, mp3_dir)

    if not rows:
        logger.error("No rows produced — check timings and audio files")
        sys.exit(1)

    # Build HuggingFace Dataset
    from datasets import Dataset, Audio, Features, Value

    features = Features({
        "surah": Value("int32"),
        "ayah": Value("int32"),
        "audio": Audio(sampling_rate=None),
        "text": Value("string"),
        "surah_name_en": Value("string"),
        "surah_name_ar": Value("string"),
        "word_timings": Value("string"),
    })

    dataset = Dataset.from_list(rows, features=features)

    logger.info(f"Dataset created: {len(dataset)} rows")
    logger.info(f"Columns: {dataset.column_names}")

    # Save / push
    if args.output_dir:
        output_path = Path(args.output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        dataset.save_to_disk(str(output_path))
        logger.info(f"Dataset saved to {output_path}")

    if args.push_to_hub:
        logger.info(f"Pushing to HuggingFace Hub: {args.push_to_hub}")
        dataset.push_to_hub(args.push_to_hub, private=args.private)
        logger.info(f"Dataset pushed to https://huggingface.co/datasets/{args.push_to_hub}")

        # Upload dataset card with proper metadata
        from huggingface_hub import HfApi

        card_content = """\
---
language:
- ar
license: cc-by-nc-4.0
task_categories:
- automatic-speech-recognition
tags:
- quran
- qalun
- tajweed
- word-timestamps
pretty_name: Husari Qalun Quran Recitation
---

# Husari Qalun Quran Recitation (Word-Aligned)

Ayah-level audio clips with word-level timestamps from Mahmoud Khalil Al-Husari's
Qalun recitation of the Quran.

## Dataset Structure

| Column | Type | Description |
|--------|------|-------------|
| `surah` | int | Surah number (1-114) |
| `ayah` | int | Ayah number |
| `audio` | Audio | WAV clip for the ayah |
| `text` | string | Qalun Uthmanic script |
| `surah_name_en` | string | English name |
| `surah_name_ar` | string | Arabic name |
| `word_timings` | string | JSON with per-word start/end times (seconds, relative to clip) |

## Usage

```python
from datasets import load_dataset
ds = load_dataset("zowlex/quran_qalun", token=True)  # private repo
# Play first ayah
import soundfile as sf
sf.write("ayah.wav", ds[0]["audio"]["array"], ds[0]["audio"]["sampling_rate"])
```

## Source

- **Audio**: [Archive.org husari_qalun collection](https://archive.org/details/husari_qalun)
- **Text**: KFGQPC Qalun Uthmanic Script (QaloonData v10)
- **Alignment**: Whisper ASR + dynamic programming matcher ([qumemo](https://github.com/fareslassoued/qumemo))
"""

        api = HfApi()
        api.upload_file(
            path_or_fileobj=card_content.encode(),
            path_in_repo="README.md",
            repo_id=args.push_to_hub,
            repo_type="dataset",
            commit_message="Add dataset card",
        )
        logger.info("Dataset card uploaded")


if __name__ == "__main__":
    main()
