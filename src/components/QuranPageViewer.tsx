'use client';

import React, { useState, useEffect } from 'react';
import { quranDataService } from '@/services/quranDataService';
import { Ayah, PageInfo } from '@/types/quran';
import { extractAyahNumber, getAyahTextWithoutNumber } from '@/utils/ayahUtils';

interface QuranPageViewerProps {
  pageNumber: number;
  onPageChange?: (pageNumber: number) => void;
  memorizationMode?: boolean;
  hiddenAyahs?: number[];
  onAyahClick?: (ayah: Ayah) => void;
  highlightedAyah?: { surah: number; ayah: number } | null;
  onSurahPlayClick?: (surahNumber: number) => void;
}

export function QuranPageViewer({
  pageNumber,
  onPageChange,
  memorizationMode = false,
  hiddenAyahs = [],
  onAyahClick,
  highlightedAyah,
  onSurahPlayClick,
}: QuranPageViewerProps) {
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);

  useEffect(() => {
    const info = quranDataService.getPageInfo(pageNumber);
    setPageInfo(info);
  }, [pageNumber]);

  const handlePreviousPage = () => {
    if (pageNumber > 1 && onPageChange) {
      onPageChange(pageNumber - 1);
    }
  };

  const handleNextPage = () => {
    const totalPages = quranDataService.getTotalPages();
    if (pageNumber < totalPages && onPageChange) {
      onPageChange(pageNumber + 1);
    }
  };

  const isAyahHidden = (ayahNumber: number) => {
    return memorizationMode && hiddenAyahs.includes(ayahNumber);
  };

  const isAyahHighlighted = (surahNumber: number, ayahNumber: number) => {
    return (
      highlightedAyah?.surah === surahNumber &&
      highlightedAyah?.ayah === ayahNumber
    );
  };

  if (!pageInfo) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl">Loading page {pageNumber}...</div>
      </div>
    );
  }

  // Group ayahs by surah for better rendering
  const ayahsBySurah = pageInfo.ayahs.reduce((acc: Record<number, Ayah[]>, ayah: Ayah) => {
    if (!acc[ayah.sura_no]) {
      acc[ayah.sura_no] = [];
    }
    acc[ayah.sura_no].push(ayah);
    return acc;
  }, {} as Record<number, Ayah[]>);

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="bg-gray-100 dark:bg-gray-800 p-4 border-b border-gray-300 dark:border-gray-700">
        <div className="flex justify-between items-center max-w-4xl mx-auto">
          <button
            onClick={handlePreviousPage}
            disabled={pageNumber === 1}
            className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-400 disabled:cursor-not-allowed hover:bg-blue-600"
          >
            ← Previous
          </button>

          <div className="text-center">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Page {pageNumber} of {quranDataService.getTotalPages()}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-500">
              Juz {pageInfo.juz}
            </div>
          </div>

          <button
            onClick={handleNextPage}
            disabled={pageNumber === quranDataService.getTotalPages()}
            className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-400 disabled:cursor-not-allowed hover:bg-blue-600"
          >
            Next →
          </button>
        </div>
      </div>

      {/* Page Content */}
      <div className="flex-1 overflow-y-auto p-6 bg-amber-50 dark:bg-gray-900">
        <div className="max-w-4xl mx-auto">
          {/* Display by Surah */}
          {Object.entries(ayahsBySurah).map(([surahNo, ayahs]: [string, Ayah[]]) => (
            <div key={surahNo} className="mb-8">
              {/* Surah Header */}
              {ayahs[0].aya_no === 1 && (
                <div className="mb-6">
                  <div className="relative text-center py-4 bg-gradient-to-r from-amber-200 to-amber-300 dark:from-gray-800 dark:to-gray-700 rounded-lg shadow-md">
                    {/* Play Button */}
                    {onSurahPlayClick && (
                      <button
                        onClick={() => onSurahPlayClick(parseInt(surahNo))}
                        className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-lg transition-all hover:scale-110"
                        title={`Play ${ayahs[0].sura_name_en}`}
                      >
                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                        </svg>
                      </button>
                    )}

                    <div className="text-3xl quran-text mb-2">
                      {ayahs[0].sura_name_ar}
                    </div>
                    <div className="text-sm text-gray-700 dark:text-gray-300">
                      {ayahs[0].sura_name_en}
                    </div>
                  </div>

                  {/* Bismillah (except for Surah 9) */}
                  {parseInt(surahNo) !== 1 && parseInt(surahNo) !== 9 && (
                    <div className="text-center my-6 quran-text text-2xl">
                      بِسۡمِ اللهِ الرَّحۡمٰنِ الرَّحِيمِ
                    </div>
                  )}
                </div>
              )}

              {/* Ayahs */}
              <div className="quran-text text-justify leading-loose">
                {ayahs.map((ayah: Ayah) => {
                  const ayahText = getAyahTextWithoutNumber(ayah.aya_text);
                  const ayahNumber = extractAyahNumber(ayah.aya_text);

                  return (
                    <span
                      key={ayah.id}
                      onClick={() => onAyahClick?.(ayah)}
                      className={`ayah ${
                        isAyahHidden(ayah.aya_no) ? 'hidden' : ''
                      } ${
                        isAyahHighlighted(ayah.sura_no, ayah.aya_no)
                          ? 'highlighted'
                          : ''
                      }`}
                      data-surah={ayah.sura_no}
                      data-ayah={ayah.aya_no}
                    >
                      <span className="ayah-text">{ayahText}</span>
                      {ayahNumber && <span className="ayah-number"> {ayahNumber}</span>}
                      {' '}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer - Page Info */}
      <div className="bg-gray-100 dark:bg-gray-800 p-3 border-t border-gray-300 dark:border-gray-700">
        <div className="text-center text-sm text-gray-600 dark:text-gray-400">
          {pageInfo.ayahs.length} ayahs on this page
          {memorizationMode && (
            <span className="ml-4 text-orange-600 dark:text-orange-400">
              Memorization Mode Active ({hiddenAyahs.length} ayahs hidden)
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
