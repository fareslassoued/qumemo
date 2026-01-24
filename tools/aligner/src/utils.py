"""Utility functions for the aligner."""

import logging
import sys
from pathlib import Path
from typing import List, Optional

from tqdm import tqdm


def setup_logging(
    level: int = logging.INFO,
    log_file: Optional[Path] = None,
) -> logging.Logger:
    """
    Set up logging configuration.

    Args:
        level: Logging level
        log_file: Optional file to write logs to

    Returns:
        Configured logger
    """
    logger = logging.getLogger("quran_aligner")
    logger.setLevel(level)

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)
    console_format = logging.Formatter(
        "%(asctime)s - %(levelname)s - %(message)s",
        datefmt="%H:%M:%S",
    )
    console_handler.setFormatter(console_format)
    logger.addHandler(console_handler)

    # File handler (optional)
    if log_file:
        file_handler = logging.FileHandler(log_file)
        file_handler.setLevel(level)
        file_format = logging.Formatter(
            "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
        )
        file_handler.setFormatter(file_format)
        logger.addHandler(file_handler)

    return logger


def parse_surah_range(surah_arg: str) -> List[int]:
    """
    Parse surah range argument.

    Examples:
        "1" -> [1]
        "1-5" -> [1, 2, 3, 4, 5]
        "1,3,5" -> [1, 3, 5]
        "1-3,5,7-9" -> [1, 2, 3, 5, 7, 8, 9]
        "all" -> [1, 2, ..., 114]

    Args:
        surah_arg: Surah specification string

    Returns:
        List of surah numbers
    """
    if surah_arg.lower() == "all":
        return list(range(1, 115))

    surahs = set()

    for part in surah_arg.split(","):
        part = part.strip()
        if "-" in part:
            start, end = part.split("-", 1)
            for i in range(int(start), int(end) + 1):
                if 1 <= i <= 114:
                    surahs.add(i)
        else:
            num = int(part)
            if 1 <= num <= 114:
                surahs.add(num)

    return sorted(surahs)


def progress_bar(
    items,
    desc: str = "",
    unit: str = "it",
    leave: bool = True,
):
    """Create a progress bar wrapper."""
    return tqdm(
        items,
        desc=desc,
        unit=unit,
        leave=leave,
        ncols=80,
    )


# Surah names for reference
SURAH_NAMES = {
    1: ("الفَاتِحة", "Al-Fātiḥah"),
    2: ("البَقَرَة", "Al-Baqarah"),
    3: ("آل عِمْرَان", "Āl ʿImrān"),
    4: ("النِّسَاء", "An-Nisāʾ"),
    5: ("المَائِدَة", "Al-Māʾidah"),
    6: ("الأَنْعَام", "Al-Anʿām"),
    7: ("الأَعْرَاف", "Al-Aʿrāf"),
    8: ("الأَنْفَال", "Al-Anfāl"),
    9: ("التَّوْبَة", "At-Tawbah"),
    10: ("يُونُس", "Yūnus"),
    # ... abbreviated for brevity, will be populated from data
}


def get_surah_name(surah_no: int, arabic: bool = True) -> str:
    """Get surah name by number."""
    if surah_no in SURAH_NAMES:
        return SURAH_NAMES[surah_no][0 if arabic else 1]
    return f"Surah {surah_no}"
