# Quran Audio Aligner

CTC forced alignment pipeline for Quran audio with Qaloon text. Generates word-level timing data for each ayah.

## Quick Start

```bash
# 1. Setup environment (WSL2 CUDA hardening)
./setup.sh

# 2. Install dependencies
uv sync --extra cuda   # For GPU
# or
uv sync --extra cpu    # For CPU only

# 3. Run alignment
uv run python aligner.py --surah 1
```

## Usage

### Process Single Surah

```bash
uv run python aligner.py --surah 1
```

### Process Multiple Surahs

```bash
# Specific surahs
uv run python aligner.py --surah 1 2 3

# Range
uv run python aligner.py --surah 1-10

# All surahs
uv run python aligner.py --surah all
```

### Skip Existing Files

```bash
uv run python aligner.py --surah all --skip-existing
```

### Export HuggingFace Dataset

```bash
uv run python aligner.py --surah all --export-hf
```

### Force CPU Mode

```bash
uv run python aligner.py --surah 1 --device cpu
```

## Output Format

Each surah produces a JSON file in `output/`:

```json
{
  "surah_no": 1,
  "surah_name_ar": "الفَاتِحة",
  "surah_name_en": "Al-Fātiḥah",
  "ayah_count": 7,
  "ayahs": [
    {
      "id": 1,
      "aya_no": 1,
      "aya_text": "اِ۬لْحَمْدُ لِلهِ رَبِّ اِ۬لْعَٰلَمِينَ ١",
      "start_time": 0.0,
      "end_time": 3.52,
      "word_timings": [
        {"word": "اِ۬لْحَمْدُ", "start": 0.0, "end": 0.84},
        {"word": "لِلهِ", "start": 0.84, "end": 1.32},
        {"word": "رَبِّ", "start": 1.32, "end": 1.86},
        {"word": "اِ۬لْعَٰلَمِينَ", "start": 1.86, "end": 3.52}
      ]
    }
  ]
}
```

## Directory Structure

```
tools/aligner/
├── aligner.py          # Main CLI entry point
├── pyproject.toml      # uv/Python config
├── setup.sh            # WSL2 CUDA setup script
├── src/
│   ├── audio_processor.py  # MP3 download + WAV conversion
│   ├── text_cleaner.py     # Arabic text normalization
│   ├── ctc_aligner.py      # CTC forced alignment
│   ├── output_formatter.py # JSON + HuggingFace export
│   └── utils.py            # Utilities
├── editor/
│   └── index.html      # Timing correction tool
├── output/             # Generated timing JSONs
├── output_fixed/       # Manually corrected timings
├── cache/
│   ├── mp3/            # Downloaded MP3s
│   └── wav/            # Converted WAVs
└── tests/
    └── test_text_cleaner.py
```

## Running Tests

```bash
uv run pytest tests/ -v
```

## Timing Correction Tool

Open `editor/index.html` in a browser to manually verify and correct timings:

1. Load a timing JSON file
2. Load the corresponding audio file
3. Click ayahs to seek to their start time
4. Edit start/end times as needed
5. Save corrected JSON to `output_fixed/`

## Data Sources

- **Quran Text**: KFGQPC Qaloon Uthmanic Script (QaloonData_v10.json)
- **Audio**: [Archive.org husari_qalun collection](https://archive.org/details/husari_qalun) - Mahmoud Khalil Al-Husari
- **Model**: [jonatasgrosman/wav2vec2-large-xlsr-53-arabic](https://huggingface.co/jonatasgrosman/wav2vec2-large-xlsr-53-arabic)

## Requirements

- Python 3.10+
- [uv](https://github.com/astral-sh/uv) package manager
- CUDA 12.4+ (optional, for GPU acceleration)
- ~8GB VRAM for GPU mode, ~16GB RAM for CPU mode

## Troubleshooting

### CUDA Not Detected

Run `./setup.sh` to check CUDA availability and fix common WSL2 issues.

### Out of Memory

Use `--device cpu` to fall back to CPU mode, or process surahs one at a time.

### Audio Download Fails

Check your internet connection. Audio is downloaded from Archive.org.
