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
  /** When true, hides the built-in prev/next navigation bars (parent controls navigation) */
  hideNavigation?: boolean;
}

export function QuranPageViewer({
  pageNumber,
  onPageChange,
  memorizationMode = false,
  hiddenAyahs = [],
  onAyahClick,
  highlightedAyah,
  onSurahPlayClick,
  hideNavigation = false,
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
    const isMemorizationMode = memorizationMode || hiddenAyahs.length > 0;
    return isMemorizationMode && hiddenAyahs.includes(ayahNumber);
  };

  const isAyahHighlighted = (surahNumber: number, ayahNumber: number) => {
    return (
      highlightedAyah?.surah === surahNumber &&
      highlightedAyah?.ayah === ayahNumber
    );
  };

  if (!pageInfo) {
    return (
      <div className="flex items-center justify-center h-full text-dim font-sans text-sm">
        Loading…
      </div>
    );
  }

  // Group ayahs by surah
  const ayahsBySurah = pageInfo.ayahs.reduce((acc: Record<number, Ayah[]>, ayah: Ayah) => {
    if (!acc[ayah.sura_no]) acc[ayah.sura_no] = [];
    acc[ayah.sura_no].push(ayah);
    return acc;
  }, {} as Record<number, Ayah[]>);

  const content = (
    <div className="max-w-2xl mx-auto px-4 sm:px-8 py-6">
      {Object.entries(ayahsBySurah).map(([surahNo, ayahs]: [string, Ayah[]]) => (
        <div key={surahNo} className="mb-10">

          {/* Surah header — only shown at ayah 1 */}
          {ayahs[0].aya_no === 1 && (
            <div className="mb-8 text-center select-none">
              {/* Top ornamental line */}
              <div className="flex items-center gap-3 mb-5">
                <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, transparent, var(--gold))' }} />
                <span style={{ color: 'var(--gold)', fontSize: '0.6rem' }}>✦ ✦ ✦</span>
                <div className="flex-1 h-px" style={{ background: 'linear-gradient(to left, transparent, var(--gold))' }} />
              </div>

              {/* Play button + surah Arabic name */}
              <div className="relative inline-block">
                {onSurahPlayClick && (
                  <button
                    onClick={() => onSurahPlayClick(parseInt(surahNo))}
                    className="absolute -right-10 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full transition-all hover:scale-110 touch-manipulation"
                    style={{ background: 'var(--gold)', color: 'var(--parchment)' }}
                    title={`Play ${ayahs[0].sura_name_en}`}
                  >
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                    </svg>
                  </button>
                )}
                <div className="quran-text text-4xl sm:text-5xl mb-1" style={{ color: 'var(--ink)' }}>
                  {ayahs[0].sura_name_ar}
                </div>
              </div>

              <div
                className="text-xs tracking-[0.25em] uppercase mt-2 mb-1"
                style={{ color: 'var(--gold)', fontFamily: 'var(--font-garamond), Georgia, serif' }}
              >
                {ayahs[0].sura_name_en}
              </div>

              {/* Bismillah (not for 1 or 9) */}
              {parseInt(surahNo) !== 1 && parseInt(surahNo) !== 9 && (
                <div
                  className="quran-text text-xl sm:text-2xl mt-5"
                  style={{ color: 'var(--dim)' }}
                >
                  بِسۡمِ اللهِ الرَّحۡمٰنِ الرَّحِيمِ
                </div>
              )}

              {/* Bottom ornamental line */}
              <div className="flex items-center gap-3 mt-5">
                <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, transparent, var(--gold))' }} />
                <span style={{ color: 'var(--gold)', fontSize: '0.6rem' }}>✦ ✦ ✦</span>
                <div className="flex-1 h-px" style={{ background: 'linear-gradient(to left, transparent, var(--gold))' }} />
              </div>
            </div>
          )}

          {/* Ayah text block */}
          <div className="quran-text">
            {ayahs.map((ayah: Ayah) => {
              const ayahText = getAyahTextWithoutNumber(ayah.aya_text);
              const ayahNumber = extractAyahNumber(ayah.aya_text);

              return (
                <span
                  key={ayah.id}
                  onClick={() => onAyahClick?.(ayah)}
                  className={`ayah ${isAyahHidden(ayah.aya_no) ? 'hidden' : ''} ${
                    isAyahHighlighted(ayah.sura_no, ayah.aya_no) ? 'highlighted' : ''
                  }`}
                  data-surah={ayah.sura_no}
                  data-ayah={ayah.aya_no}
                >
                  <span className="ayah-text">{ayahText}</span>
                  {ayahNumber && (
                    <span
                      className="ayah-number inline-block mx-0.5 text-[0.75em] align-middle"
                      style={{ color: 'var(--gold)' }}
                    >
                      {ayahNumber}
                    </span>
                  )}
                  {' '}
                </span>
              );
            })}
          </div>
        </div>
      ))}

      {/* Hidden ayahs indicator */}
      {hiddenAyahs.length > 0 && (
        <div
          className="text-center text-xs py-2"
          style={{ color: 'var(--dim)', fontFamily: 'var(--font-garamond), Georgia, serif' }}
        >
          {hiddenAyahs.length} ayahs hidden
        </div>
      )}
    </div>
  );

  // Immersive mode: just the scrollable content
  if (hideNavigation) {
    return (
      <div className="h-full overflow-y-auto" style={{ background: 'var(--parchment)' }}>
        {content}
      </div>
    );
  }

  // Default mode: with navigation bars (used in memorization etc.)
  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--parchment)' }}>
      {/* Navigation header */}
      <div
        className="shrink-0 flex justify-between items-center px-4 py-2.5 border-b"
        style={{ background: 'var(--bar-bg)', borderColor: 'var(--divider)' }}
      >
        <button
          onClick={handlePreviousPage}
          disabled={pageNumber === 1}
          className="px-3 py-1.5 rounded text-sm transition-colors touch-manipulation disabled:opacity-30"
          style={{
            background: 'var(--gold)',
            color: 'var(--parchment)',
            fontFamily: 'var(--font-garamond), Georgia, serif',
          }}
        >
          ← Prev
        </button>

        <div
          className="text-center text-xs"
          style={{ color: 'var(--dim)', fontFamily: 'var(--font-garamond), Georgia, serif' }}
        >
          <div>Page {pageNumber} of {quranDataService.getTotalPages()}</div>
          <div style={{ color: 'var(--gold)' }}>Juz {pageInfo.juz}</div>
        </div>

        <button
          onClick={handleNextPage}
          disabled={pageNumber === quranDataService.getTotalPages()}
          className="px-3 py-1.5 rounded text-sm transition-colors touch-manipulation disabled:opacity-30"
          style={{
            background: 'var(--gold)',
            color: 'var(--parchment)',
            fontFamily: 'var(--font-garamond), Georgia, serif',
          }}
        >
          Next →
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {content}
      </div>

      {/* Footer */}
      <div
        className="shrink-0 py-2.5 border-t text-center text-xs"
        style={{
          background: 'var(--bar-bg)',
          borderColor: 'var(--divider)',
          color: 'var(--dim)',
          fontFamily: 'var(--font-garamond), Georgia, serif',
        }}
      >
        {pageInfo.ayahs.length} ayahs on this page
      </div>
    </div>
  );
}
