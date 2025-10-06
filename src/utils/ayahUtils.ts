/**
 * Utility functions for handling ayah text and numbers
 */

/**
 * Extract ayah number from Arabic text
 * Ayah numbers are represented as Arabic-Indic digits at the end (e.g., ١، ٢، ٣)
 */
export function extractAyahNumber(ayahText: string): string | null {
  // Arabic-Indic numerals: ٠-٩
  // Also includes decorative markers like ۞
  const numberMatch = ayahText.match(/([٠-٩]+)\s*$/);
  return numberMatch ? numberMatch[1] : null;
}

/**
 * Get ayah text without the number
 */
export function getAyahTextWithoutNumber(ayahText: string): string {
  // Remove the ayah number from the end
  return ayahText.replace(/\s*[٠-٩]+\s*$/, '').trim();
}

/**
 * Convert Arabic-Indic numerals to regular numerals
 */
export function arabicIndicToNumeral(arabicIndic: string): number {
  const arabicNumerals: Record<string, string> = {
    '٠': '0',
    '١': '1',
    '٢': '2',
    '٣': '3',
    '٤': '4',
    '٥': '5',
    '٦': '6',
    '٧': '7',
    '٨': '8',
    '٩': '9',
  };

  const numeral = arabicIndic
    .split('')
    .map((char) => arabicNumerals[char] || char)
    .join('');

  return parseInt(numeral, 10);
}
