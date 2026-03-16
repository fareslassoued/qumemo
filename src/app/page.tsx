'use client';

import React, { useState, useRef, useEffect } from 'react';
import { QuranPageViewer } from '@/components/QuranPageViewer';
import { AudioPlayer } from '@/components/AudioPlayer';
import { NavigationSidebar } from '@/components/NavigationSidebar';
import { storageService } from '@/services/storageService';
import { quranDataService } from '@/services/quranDataService';
import Link from 'next/link';

const TOTAL_PAGES = 604;
const STORAGE_KEY = 'qumemo-theme';

export default function Home() {
  const [currentPage, setCurrentPage] = useState(1);
  const [showSidebar, setShowSidebar] = useState(false);
  const [isDark, setIsDark] = useState(false);

  // Init theme from localStorage or system preference
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') {
      const dark = saved === 'dark';
      setIsDark(dark);
      applyTheme(dark);
    } else {
      const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setIsDark(sysDark);
    }
  }, []);

  const applyTheme = (dark: boolean) => {
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.classList.toggle('light', !dark);
  };

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    applyTheme(next);
    localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
  };

  // Swipe tracking
  const swipeStartX = useRef(0);
  const swipeStartY = useRef(0);

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  const handleNextPage = () => {
    if (currentPage < TOTAL_PAGES) setCurrentPage(currentPage + 1);
  };

  const handleToggleBookmark = () => {
    const isBookmarked = storageService.isPageBookmarked(currentPage);
    if (isBookmarked) {
      const bookmark = storageService.getBookmarkForPage(currentPage);
      if (bookmark) storageService.removeBookmark(bookmark.id);
    } else {
      const pageInfo = quranDataService.getPageInfo(currentPage);
      if (pageInfo && pageInfo.ayahs.length > 0) {
        const firstAyah = pageInfo.ayahs[0];
        storageService.addBookmark({
          surahNumber: firstAyah.sura_no,
          ayahNumber: firstAyah.aya_no,
          pageNumber: currentPage,
          note: `Page ${currentPage}`,
        });
      }
    }
  };

  const handleSurahPlayClick = async (surahNumber: number) => {
    const { audioService } = await import('@/services/audioService');
    await audioService.play(surahNumber);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    swipeStartX.current = e.clientX;
    swipeStartY.current = e.clientY;
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const dx = e.clientX - swipeStartX.current;
    const dy = e.clientY - swipeStartY.current;
    // Require >60px horizontal, more horizontal than vertical
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      // Arabic book: swipe left → next page, swipe right → prev page
      if (dx < 0) handleNextPage();
      else handlePrevPage();
    }
  };

  const isBookmarked = storageService.isPageBookmarked(currentPage);
  const pageInfo = quranDataService.getPageInfo(currentPage);
  const currentSurah = pageInfo?.ayahs[0]?.sura_no || 1;
  const surahName = pageInfo?.ayahs[0]?.sura_name_en || '';
  const juz = pageInfo?.juz;

  const uiFont = { fontFamily: "var(--font-garamond), Georgia, serif" };

  return (
    <div
      className="flex flex-col h-screen touch-manipulation select-none"
      style={{ background: 'var(--parchment)' }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      {/* Sidebar overlay — slides from right */}
      {showSidebar && (
        <>
          <div
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(28, 18, 7, 0.4)', backdropFilter: 'blur(2px)' }}
            onClick={() => setShowSidebar(false)}
          />
          <div className="fixed inset-y-0 right-0 z-50">
            <NavigationSidebar
              currentPage={currentPage}
              onPageSelect={(page) => {
                setCurrentPage(page);
                setShowSidebar(false);
              }}
              onClose={() => setShowSidebar(false)}
            />
          </div>
        </>
      )}

      {/* ── Top navigation bar ─────────────────────────────── */}
      <div
        className="shrink-0 flex items-center h-12 px-3 gap-2 border-b"
        style={{ background: 'var(--bar-bg)', borderColor: 'var(--divider)' }}
        dir="ltr"
      >
        {/* Prev page */}
        <button
          onClick={handlePrevPage}
          disabled={currentPage === 1}
          className="w-8 h-8 flex items-center justify-center rounded-full transition-colors disabled:opacity-30"
          style={{ color: 'var(--dim)' }}
          title="Previous page"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Center info */}
        <div className="flex-1 text-center leading-tight">
          <div className="text-xs font-medium truncate" style={{ color: 'var(--ink)', ...uiFont }}>
            {surahName}
          </div>
          <div className="text-[10px] tracking-wider" style={{ color: 'var(--dim)', ...uiFont }}>
            Page {currentPage} · Juz {juz}
          </div>
        </div>

        {/* Next page */}
        <button
          onClick={handleNextPage}
          disabled={currentPage === TOTAL_PAGES}
          className="w-8 h-8 flex items-center justify-center rounded-full transition-colors disabled:opacity-30"
          style={{ color: 'var(--dim)' }}
          title="Next page"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Divider */}
        <div className="w-px h-5 mx-1" style={{ background: 'var(--divider)' }} />

        {/* Bookmark */}
        <button
          onClick={handleToggleBookmark}
          className="w-8 h-8 flex items-center justify-center rounded-full transition-colors text-base"
          style={{ color: isBookmarked ? 'var(--gold)' : 'var(--dim)' }}
          title={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
        >
          {isBookmarked ? '★' : '☆'}
        </button>

        {/* Memorize */}
        <Link
          href="/memorization"
          className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
          style={{ color: 'var(--dim)' }}
          title="Memorization"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        </Link>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
          style={{ color: 'var(--dim)' }}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
            </svg>
          )}
        </button>

        {/* Menu */}
        <button
          onClick={() => setShowSidebar(true)}
          className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
          style={{ color: 'var(--dim)' }}
          title="Navigation"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* ── Quran content ──────────────────────────────────── */}
      <div className="flex-1 overflow-hidden">
        <QuranPageViewer
          pageNumber={currentPage}
          onPageChange={setCurrentPage}
          onSurahPlayClick={handleSurahPlayClick}
          hideNavigation={true}
        />
      </div>

      {/* ── Audio player ───────────────────────────────────── */}
      <AudioPlayer surahNumber={currentSurah} />
    </div>
  );
}
