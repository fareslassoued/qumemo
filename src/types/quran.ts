// Quran Ayah Data Structure (Qalun recitation)
export interface Ayah {
  id: number;
  jozz: number;
  page: string;
  sura_no: number;
  sura_name_en: string;
  sura_name_ar: string;
  line_start: number;
  line_end: number;
  aya_no: number;
  aya_text: string;
}

// Surah Information
export interface Surah {
  number: number;
  name: string;
  nameArabic: string;
  englishName: string;
  englishNameTranslation: string;
  revelationType: 'Meccan' | 'Medinan';
  numberOfAyahs: number;
}

// Page Information
export interface PageInfo {
  pageNumber: number;
  ayahs: Ayah[];
  juz: number;
  surahsOnPage: number[];
}

// Juz Information
export interface JuzInfo {
  juzNumber: number;
  startSurah: number;
  startAyah: number;
  endSurah: number;
  endAyah: number;
}

// Bookmark
export interface Bookmark {
  id: string;
  surahNumber: number;
  ayahNumber: number;
  pageNumber: number;
  note?: string;
  createdAt: Date;
}

// Recitation Settings
export interface RecitationSettings {
  repeatAyah: boolean;
  repeatCount: number;
  repeatSection: boolean;
  sectionStart: { surah: number; ayah: number };
  sectionEnd: { surah: number; ayah: number };
  playbackSpeed: number;
}

// Recording
export interface Recording {
  id: string;
  surahNumber: number;
  ayahNumber: number;
  pageNumber: number;
  audioBlob: Blob;
  duration: number;
  createdAt: Date;
}

// Audio Player State
export interface AudioPlayerState {
  isPlaying: boolean;
  currentSurah: number;
  currentAyah: number;
  currentTime: number;
  duration: number;
  volume: number;
  playbackSpeed: number;
}

// Memorization Session
export interface MemorizationSession {
  id: string;
  pageNumber: number;
  hiddenAyahs: number[];
  recordings: Recording[];
  startedAt: Date;
  completedAt?: Date;
}
