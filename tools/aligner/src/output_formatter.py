"""Output formatting for aligned Quran data."""

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class OutputFormatter:
    """Format and export aligned Quran data."""

    def __init__(self, output_dir: Optional[Path] = None):
        """
        Initialize output formatter.

        Args:
            output_dir: Directory for output files. Defaults to ./output
        """
        if output_dir is None:
            output_dir = Path(__file__).parent.parent / "output"

        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def format_surah_json(
        self,
        surah_no: int,
        surah_name_ar: str,
        surah_name_en: str,
        aligned_ayahs: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Format aligned ayahs as surah JSON.

        Args:
            surah_no: Surah number
            surah_name_ar: Arabic name
            surah_name_en: English name
            aligned_ayahs: Aligned ayah data

        Returns:
            Formatted surah dict
        """
        return {
            "surah_no": surah_no,
            "surah_name_ar": surah_name_ar,
            "surah_name_en": surah_name_en,
            "ayah_count": len(aligned_ayahs),
            "ayahs": [
                {
                    "id": ayah.get("id"),
                    "aya_no": ayah.get("aya_no"),
                    "aya_text": ayah.get("aya_text"),
                    "start_time": ayah.get("start_time", 0.0),
                    "end_time": ayah.get("end_time", 0.0),
                    "word_timings": ayah.get("word_timings", []),
                }
                for ayah in aligned_ayahs
            ],
        }

    def save_surah_json(
        self,
        surah_no: int,
        surah_name_ar: str,
        surah_name_en: str,
        aligned_ayahs: List[Dict[str, Any]],
    ) -> Path:
        """
        Save aligned surah data as JSON.

        Args:
            surah_no: Surah number
            surah_name_ar: Arabic name
            surah_name_en: English name
            aligned_ayahs: Aligned ayah data

        Returns:
            Path to saved JSON file
        """
        data = self.format_surah_json(
            surah_no, surah_name_ar, surah_name_en, aligned_ayahs
        )

        output_path = self.output_dir / f"{surah_no:03d}_timings.json"

        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        logger.info(f"Saved {output_path}")
        return output_path

    def load_surah_json(self, surah_no: int) -> Optional[Dict[str, Any]]:
        """Load existing surah JSON if it exists."""
        json_path = self.output_dir / f"{surah_no:03d}_timings.json"
        if not json_path.exists():
            return None

        with open(json_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def export_huggingface_dataset(
        self,
        aligned_surahs: List[Dict[str, Any]],
        output_name: str = "quran_timings",
    ) -> Path:
        """
        Export aligned data as HuggingFace Dataset.

        Args:
            aligned_surahs: List of formatted surah dicts
            output_name: Name for the dataset directory

        Returns:
            Path to dataset directory
        """
        try:
            from datasets import Dataset, DatasetDict
        except ImportError:
            raise ImportError(
                "datasets package required for HuggingFace export. "
                "Run: uv add datasets"
            )

        # Flatten to ayah-level records
        records = []
        for surah in aligned_surahs:
            for ayah in surah.get("ayahs", []):
                records.append({
                    "surah_no": surah["surah_no"],
                    "surah_name_ar": surah["surah_name_ar"],
                    "surah_name_en": surah["surah_name_en"],
                    "ayah_id": ayah["id"],
                    "ayah_no": ayah["aya_no"],
                    "text": ayah["aya_text"],
                    "start_time": ayah["start_time"],
                    "end_time": ayah["end_time"],
                    "word_timings": json.dumps(
                        ayah["word_timings"], ensure_ascii=False
                    ),
                })

        # Create dataset
        dataset = Dataset.from_list(records)

        # Save to disk
        output_path = self.output_dir / output_name
        dataset.save_to_disk(str(output_path))

        logger.info(f"Saved HuggingFace dataset to {output_path}")
        return output_path

    def collect_all_jsons(self) -> List[Dict[str, Any]]:
        """Load all existing surah JSON files."""
        surahs = []
        for i in range(1, 115):
            data = self.load_surah_json(i)
            if data:
                surahs.append(data)
        return surahs

    def get_alignment_stats(self) -> Dict[str, Any]:
        """Get statistics about aligned surahs."""
        surahs = self.collect_all_jsons()

        total_ayahs = sum(s.get("ayah_count", 0) for s in surahs)
        total_words = sum(
            len(a.get("word_timings", []))
            for s in surahs
            for a in s.get("ayahs", [])
        )

        return {
            "surahs_aligned": len(surahs),
            "total_ayahs": total_ayahs,
            "total_words": total_words,
            "missing_surahs": [
                i for i in range(1, 115)
                if not (self.output_dir / f"{i:03d}_timings.json").exists()
            ],
        }
