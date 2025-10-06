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
