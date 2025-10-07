import { Ayah, PageInfo, Surah } from '@/types/quran';
import qaloonData from '@/data/quran/QaloonData_v10.json';

class QuranDataService {
  private ayahs: Ayah[];

  constructor() {
    this.ayahs = qaloonData as Ayah[];
  }

  /**
   * Get all ayahs for a specific page
   */
  getPageAyahs(pageNumber: number): Ayah[] {
    return this.ayahs.filter(ayah => parseInt(ayah.page) === pageNumber);
  }

  /**
   * Get page information including all ayahs
   */
  getPageInfo(pageNumber: number): PageInfo | null {
    const ayahs = this.getPageAyahs(pageNumber);

    if (ayahs.length === 0) return null;

    const surahsOnPage = Array.from(new Set(ayahs.map(ayah => ayah.sura_no)));
    const juz = ayahs[0].jozz;

    return {
      pageNumber,
      ayahs,
      juz,
      surahsOnPage,
    };
  }

  /**
   * Get ayahs for a specific surah
   */
  getSurahAyahs(surahNumber: number): Ayah[] {
    return this.ayahs.filter(ayah => ayah.sura_no === surahNumber);
  }

  /**
   * Get a specific ayah by surah and ayah number
   */
  getAyah(surahNumber: number, ayahNumber: number): Ayah | undefined {
    return this.ayahs.find(
      ayah => ayah.sura_no === surahNumber && ayah.aya_no === ayahNumber
    );
  }

  /**
   * Get ayah by global ID
   */
  getAyahById(id: number): Ayah | undefined {
    return this.ayahs.find(ayah => ayah.id === id);
  }

  /**
   * Search ayahs by Arabic text
   */
  searchAyahs(query: string): Ayah[] {
    const normalizedQuery = query.trim();
    return this.ayahs.filter(ayah =>
      ayah.aya_text.includes(normalizedQuery)
    );
  }

  /**
   * Get all ayahs in a juz
   */
  getJuzAyahs(juzNumber: number): Ayah[] {
    return this.ayahs.filter(ayah => ayah.jozz === juzNumber);
  }

  /**
   * Get unique list of surahs with basic info
   */
  getAllSurahs(): Surah[] {
    const surahMap = new Map<number, Ayah>();

    this.ayahs.forEach(ayah => {
      if (!surahMap.has(ayah.sura_no)) {
        surahMap.set(ayah.sura_no, ayah);
      }
    });

    return Array.from(surahMap.values()).map(ayah => ({
      number: ayah.sura_no,
      name: ayah.sura_name_ar,
      nameArabic: ayah.sura_name_ar,
      englishName: ayah.sura_name_en,
      englishNameTranslation: ayah.sura_name_en,
      revelationType: this.getSurahRevelationType(ayah.sura_no),
      numberOfAyahs: this.getSurahAyahs(ayah.sura_no).length,
    }));
  }

  /**
   * Get surah info
   */
  getSurahInfo(surahNumber: number): Surah | null {
    const ayahs = this.getSurahAyahs(surahNumber);
    if (ayahs.length === 0) return null;

    const firstAyah = ayahs[0];
    return {
      number: surahNumber,
      name: firstAyah.sura_name_ar,
      nameArabic: firstAyah.sura_name_ar,
      englishName: firstAyah.sura_name_en,
      englishNameTranslation: firstAyah.sura_name_en,
      revelationType: this.getSurahRevelationType(surahNumber),
      numberOfAyahs: ayahs.length,
    };
  }

  /**
   * Get page number for a specific ayah
   */
  getPageNumber(surahNumber: number, ayahNumber: number): number | null {
    const ayah = this.getAyah(surahNumber, ayahNumber);
    return ayah ? parseInt(ayah.page) : null;
  }

  /**
   * Get next ayah
   */
  getNextAyah(surahNumber: number, ayahNumber: number): Ayah | null {
    const currentAyah = this.getAyah(surahNumber, ayahNumber);
    if (!currentAyah) return null;

    const nextId = currentAyah.id + 1;
    return this.getAyahById(nextId) || null;
  }

  /**
   * Get previous ayah
   */
  getPreviousAyah(surahNumber: number, ayahNumber: number): Ayah | null {
    const currentAyah = this.getAyah(surahNumber, ayahNumber);
    if (!currentAyah || currentAyah.id === 1) return null;

    const prevId = currentAyah.id - 1;
    return this.getAyahById(prevId) || null;
  }

  /**
   * Get total number of pages
   */
  getTotalPages(): number {
    const pages = new Set(this.ayahs.map(ayah => parseInt(ayah.page)));
    return Math.max(...Array.from(pages));
  }

  /**
   * Get ayahs in a range
   */
  getAyahRange(
    startSurah: number,
    startAyah: number,
    endSurah: number,
    endAyah: number
  ): Ayah[] {
    const start = this.getAyah(startSurah, startAyah);
    const end = this.getAyah(endSurah, endAyah);

    if (!start || !end) return [];

    return this.ayahs.filter(
      ayah => ayah.id >= start.id && ayah.id <= end.id
    );
  }

  /**
   * Get which surah(s) a page primarily contains
   */
  getPageSurahs(pageNumber: number): number[] {
    const pageInfo = this.getPageInfo(pageNumber);
    return pageInfo?.surahsOnPage || [];
  }

  /**
   * Get the primary (most represented) surah on a page
   */
  getPagePrimarySurah(pageNumber: number): number | null {
    const ayahs = this.getPageAyahs(pageNumber);
    if (ayahs.length === 0) return null;

    // Count ayahs per surah on this page
    const surahCounts = new Map<number, number>();
    ayahs.forEach(ayah => {
      surahCounts.set(ayah.sura_no, (surahCounts.get(ayah.sura_no) || 0) + 1);
    });

    // Return surah with most ayahs
    let maxSurah = ayahs[0].sura_no;
    let maxCount = 0;
    surahCounts.forEach((count, surah) => {
      if (count > maxCount) {
        maxCount = count;
        maxSurah = surah;
      }
    });

    return maxSurah;
  }

  /**
   * Get pages that contain a specific surah
   */
  getSurahPages(surahNumber: number): number[] {
    const ayahs = this.getSurahAyahs(surahNumber);
    const pages = new Set(ayahs.map(ayah => parseInt(ayah.page)));
    return Array.from(pages).sort((a, b) => a - b);
  }

  /**
   * Get all pages for multiple surahs
   */
  getSurahsPages(surahNumbers: number[]): number[] {
    const allPages = new Set<number>();
    surahNumbers.forEach(surahNumber => {
      const pages = this.getSurahPages(surahNumber);
      pages.forEach(page => allPages.add(page));
    });
    return Array.from(allPages).sort((a, b) => a - b);
  }

  /**
   * Get surahs in Juz 30 (for backward memorization)
   */
  getJuz30Surahs(): number[] {
    return [78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114];
  }

  /**
   * Estimate ayahs per day needed based on daily goal type
   */
  estimateAyahsPerDay(goalType: 'full-page' | 'half-page' | 'quarter-page'): number {
    // Average ayahs per page is ~15
    const averageAyahsPerPage = 15;
    switch (goalType) {
      case 'full-page':
        return averageAyahsPerPage;
      case 'half-page':
        return Math.floor(averageAyahsPerPage / 2);
      case 'quarter-page':
        return Math.floor(averageAyahsPerPage / 4);
      default:
        return 7;
    }
  }

  /**
   * Group surahs by appropriate daily goal
   * Returns surah numbers to memorize per session
   */
  groupSurahsByDailyGoal(surahNumbers: number[], ayahsPerDay: number): number[][] {
    const groups: number[][] = [];
    let currentGroup: number[] = [];
    let currentAyahCount = 0;

    for (const surahNum of surahNumbers) {
      const surahInfo = this.getSurahInfo(surahNum);
      if (!surahInfo) continue;

      // If adding this surah would exceed daily goal
      if (currentAyahCount > 0 && currentAyahCount + surahInfo.numberOfAyahs > ayahsPerDay) {
        // If current surah is very small (< 5 ayahs), add it anyway
        if (surahInfo.numberOfAyahs <= 5) {
          currentGroup.push(surahNum);
          currentAyahCount += surahInfo.numberOfAyahs;
        } else {
          // Start new group
          groups.push([...currentGroup]);
          currentGroup = [surahNum];
          currentAyahCount = surahInfo.numberOfAyahs;
        }
      } else {
        currentGroup.push(surahNum);
        currentAyahCount += surahInfo.numberOfAyahs;
      }
    }

    // Add remaining group
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }

  /**
   * Helper: Determine if surah is Meccan or Medinan
   * Based on traditional classification
   */
  private getSurahRevelationType(surahNumber: number): 'Meccan' | 'Medinan' {
    // Medinan surahs: 2, 3, 4, 5, 8, 9, 22, 24, 33, 47, 48, 49, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 76, 98, 110
    const medinanSurahs = [2, 3, 4, 5, 8, 9, 22, 24, 33, 47, 48, 49, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 76, 98, 110];
    return medinanSurahs.includes(surahNumber) ? 'Medinan' : 'Meccan';
  }
}

// Export singleton instance
export const quranDataService = new QuranDataService();
