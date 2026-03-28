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
const WORD_OUTPUT_DIR = path.resolve(__dirname, '../public/data/timings-words');

interface AlignedWordTiming {
  word: string;
  word_ref: string;
  start: number;
  end: number;
}

interface AlignedAyah {
  aya_no: number;
  start_time: number;
  end_time: number;
  word_timings?: AlignedWordTiming[];
}

interface AlignedTimings {
  surah: number;
  surah_no?: number;
  ayahs: AlignedAyah[];
}

function main() {
  // Ensure output directories exist
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  if (!fs.existsSync(WORD_OUTPUT_DIR)) {
    fs.mkdirSync(WORD_OUTPUT_DIR, { recursive: true });
  }

  const files = fs.readdirSync(INPUT_DIR)
    .filter(f => f.match(/^\d{3}_timings\.json$/) && !f.endsWith('.bak'));

  let count = 0;
  let wordCount = 0;

  for (const file of files) {
    const surahStr = file.slice(0, 3);
    const surahNumber = parseInt(surahStr, 10);

    const inputPath = path.join(INPUT_DIR, file);
    const raw = JSON.parse(fs.readFileSync(inputPath, 'utf-8')) as AlignedTimings;

    // Ayah-level timings (existing behavior)
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

    // Word-level timings (new: for recitation tracking error correction)
    const hasWordTimings = raw.ayahs.some(a => a.word_timings && a.word_timings.length > 0);
    if (hasWordTimings) {
      const wordOutput = {
        surah: surahNumber,
        ayahs: raw.ayahs
          .filter(a => a.word_timings && a.word_timings.length > 0)
          .map((a: AlignedAyah) => ({
            ayah: a.aya_no,
            words: a.word_timings!.map((w: AlignedWordTiming) => ({
              word: w.word,
              ref: w.word_ref,
              start: w.start,
              end: w.end,
            })),
          })),
      };

      const wordOutputPath = path.join(WORD_OUTPUT_DIR, `${surahNumber}.json`);
      fs.writeFileSync(wordOutputPath, JSON.stringify(wordOutput));
      wordCount++;
    }
  }

  console.log(`Built ${count} ayah timing files in ${OUTPUT_DIR}`);
  console.log(`Built ${wordCount} word timing files in ${WORD_OUTPUT_DIR}`);
}

main();
