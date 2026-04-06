"""ASR evaluation framework — report generation.

Produces:
- Per-model JSON report with per-surah and aggregate metrics
- Comparison Markdown table across multiple models
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from eval_config import REPORTS_DIR


def save_report(results: dict[str, Any], model_name: str, eval_set: str) -> Path:
    """Save evaluation results as JSON. Returns the report path."""
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"{model_name}_{eval_set}_{timestamp}.json"
    report_path = REPORTS_DIR / filename

    report = {
        "model": model_name,
        "eval_set": eval_set,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **results,
    }

    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"\nReport saved: {report_path}")
    return report_path


def print_summary(results: dict[str, Any], model_name: str) -> None:
    """Print a human-readable summary to stdout."""
    agg = results.get("aggregate", {})

    print(f"\n{'═' * 60}")
    print(f"  Model: {model_name}")
    print(f"{'═' * 60}")

    # WER / CER / Match Rate
    wer = agg.get("wer_mean", 0)
    cer = agg.get("cer_mean", 0)
    match_rate = agg.get("match_rate_mean", 0)
    rtf = agg.get("rtf_mean", 0)
    print(f"  WER:        {wer:6.1%}   (median {agg.get('wer_median', 0):.1%})")
    print(f"  CER:        {cer:6.1%}   (median {agg.get('cer_median', 0):.1%})")
    print(f"  Match Rate: {match_rate:6.1%}   (median {agg.get('match_rate_median', 0):.1%})")
    print(f"  RTF:        {rtf:6.2f}x")

    # Detection
    det = agg.get("detection", {})
    if det:
        print(f"\n  Detection accuracy (top-1 / top-3):")
        for dur in sorted(det.keys(), key=lambda x: int(x.rstrip("s"))):
            d = det[dur]
            print(f"    {dur:>3s}: {d.get('top1', 0):5.1%}  /  {d.get('top3', 0):5.1%}")

    # Per-surah breakdown
    per_surah = results.get("per_surah", {})
    if per_surah:
        print(f"\n  Per-surah WER:")
        # Sort by WER descending (worst first)
        sorted_surahs = sorted(
            per_surah.items(),
            key=lambda x: x[1].get("wer", 0),
            reverse=True,
        )
        for surah_no, data in sorted_surahs:
            name = data.get("name", "")
            swer = data.get("wer", 0)
            ayahs = data.get("ayah_count", 0)
            bar = "█" * int(swer * 40)
            print(f"    {int(surah_no):3d} {name:20s}  {swer:5.1%}  {bar}  ({ayahs} ayahs)")

    print(f"{'═' * 60}\n")


def print_comparison_table(report_paths: list[Path] | None = None) -> None:
    """Load all reports in REPORTS_DIR and print a comparison table."""
    if report_paths is None:
        if not REPORTS_DIR.exists():
            print("No reports found.")
            return
        report_paths = sorted(REPORTS_DIR.glob("*.json"))

    if not report_paths:
        print("No reports found.")
        return

    rows: list[dict[str, Any]] = []
    for p in report_paths:
        try:
            data = json.loads(p.read_text())
            agg = data.get("aggregate", {})
            det = agg.get("detection", {})
            rows.append({
                "model": data.get("model", "?"),
                "eval_set": data.get("eval_set", "?"),
                "wer": agg.get("wer_mean", 0),
                "cer": agg.get("cer_mean", 0),
                "match": agg.get("match_rate_mean", 0),
                "det_5s": det.get("5s", {}).get("top1"),
                "det_10s": det.get("10s", {}).get("top1"),
                "det_15s": det.get("15s", {}).get("top1"),
                "rtf": agg.get("rtf_mean", 0),
            })
        except (json.JSONDecodeError, KeyError):
            continue

    if not rows:
        print("No valid reports found.")
        return

    # Print Markdown table
    header = "| Model                     | Set  | WER    | CER   | Match  | Det@10s | Det@15s | RTF  |"
    sep = "|---------------------------|------|--------|-------|--------|---------|---------|------|"
    print(f"\n{header}")
    print(sep)

    for r in rows:
        match = f"{r['match']:5.1%}" if r.get("match") else "  -  "
        det10 = f"{r['det_10s']:5.1%}" if r["det_10s"] is not None else "  -  "
        det15 = f"{r['det_15s']:5.1%}" if r["det_15s"] is not None else "  -  "
        print(
            f"| {r['model']:25s} | {r['eval_set']:4s} "
            f"| {r['wer']:5.1%} | {r['cer']:4.1%} "
            f"| {match} | {det10}  | {det15}  | {r['rtf']:.1f}x |"
        )

    print()

    # Also save to comparison.md
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    md_path = REPORTS_DIR / "comparison.md"
    lines = [f"# ASR Model Comparison\n", f"Generated: {datetime.now(timezone.utc).isoformat()}\n", "", header, sep]
    for r in rows:
        det5 = f"{r['det_5s']:5.1%}" if r["det_5s"] is not None else "  -  "
        det10 = f"{r['det_10s']:5.1%}" if r["det_10s"] is not None else "  -  "
        det15 = f"{r['det_15s']:5.1%}" if r["det_15s"] is not None else "  -  "
        lines.append(
            f"| {r['model']:25s} | {r['eval_set']:4s} "
            f"| {r['wer']:5.1%} | {r['cer']:4.1%} "
            f"| {det5} | {det10}  | {det15}  | {r['rtf']:.1f}x |"
        )
    md_path.write_text("\n".join(lines) + "\n")
    print(f"Comparison saved: {md_path}")
