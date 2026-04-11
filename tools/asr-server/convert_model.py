"""
One-time conversion of tarteel-ai/whisper-base-ar-quran from PyTorch to CTranslate2 format.

Usage:
    cd tools/asr-server
    uv run python convert_model.py

The converted model is saved to .ct2-models/whisper-base-ar-quran/
and used by server.py at startup.
"""

import logging
from pathlib import Path

import ctranslate2

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("convert-model")

MODEL_ID = "tarteel-ai/whisper-base-ar-quran"
CT2_DIR = Path(__file__).parent / ".ct2-models" / "whisper-base-ar-quran"
QUANTIZATION = "int8"


def main():
    if (CT2_DIR / "model.bin").exists():
        logger.info("CT2 model already exists at %s — skipping conversion.", CT2_DIR)
        return

    logger.info("Converting %s → CTranslate2 (%s) ...", MODEL_ID, QUANTIZATION)
    CT2_DIR.parent.mkdir(parents=True, exist_ok=True)

    converter = ctranslate2.converters.TransformersConverter(
        MODEL_ID,
        copy_files=[
            "vocab.json",
            "merges.txt",
            "tokenizer_config.json",
            "added_tokens.json",
            "special_tokens_map.json",
            "normalizer.json",
            "preprocessor_config.json",
        ],
    )
    output = converter.convert(str(CT2_DIR), quantization=QUANTIZATION)
    logger.info("Done. Converted model saved to: %s", output)


if __name__ == "__main__":
    main()
