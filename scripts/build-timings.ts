#!/usr/bin/env npx tsx
/**
 * Build script: Extract ayah-level timings from aligner output.
 *
 * Reads tools/aligner/output/*_timings.json, strips word_timings and
 * special_segments, writes minimal ayah timing files to public/data/timings/.
 *
 * Usage: npx tsx scripts/build-timings.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const INPUT_DIR = path.resolve(__dirname, '../tools/aligner/output');
const OUTPUT_DIR = path.resolve(__dirname, '../public/data/timings');

interface AlignedAyah {
  aya_no: number;
  start_time: number;
  end_time: number;
  // word_timings and other fields are ignored
}

interface AlignedTimings {
  surah: number;
  ayahs: AlignedAyah[];
}

function main() {
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const files = fs.readdirSync(INPUT_DIR)
    .filter(f => f.match(/^\d{3}_timings\.json$/) && !f.endsWith('.bak'));

  let count = 0;

  for (const file of files) {
    const surahStr = file.slice(0, 3);
    const surahNumber = parseInt(surahStr, 10);

    const inputPath = path.join(INPUT_DIR, file);
    const raw = JSON.parse(fs.readFileSync(inputPath, 'utf-8')) as AlignedTimings;

    const output = {
      surah: surahNumber,
      ayahs: raw.ayahs.map((a: AlignedAyah) => ({
        ayah: a.aya_no,
        start: a.start_time,
        end: a.end_time,
      })),
    };

    const outputPath = path.join(OUTPUT_DIR, `${surahNumber}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(output));
    count++;
  }

  console.log(`Built ${count} timing files in ${OUTPUT_DIR}`);
}

main();
