'use client';

import React, { useState } from 'react';
import { QuranPageViewer } from '@/components/QuranPageViewer';
import { AudioPlayer } from '@/components/AudioPlayer';
import { NavigationSidebar } from '@/components/NavigationSidebar';
import { storageService } from '@/services/storageService';
import { quranDataService } from '@/services/quranDataService';

export default function Home() {
  const [currentPage, setCurrentPage] = useState(1);
  const [showSidebar, setShowSidebar] = useState(false);
  const [memorizationMode, setMemorizationMode] = useState(false);
  const [hiddenAyahs, setHiddenAyahs] = useState<number[]>([]);

  const handleToggleBookmark = () => {
    const isBookmarked = storageService.isPageBookmarked(currentPage);

    if (isBookmarked) {
      const bookmark = storageService.getBookmarkForPage(currentPage);
      if (bookmark) {
        storageService.removeBookmark(bookmark.id);
      }
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

  const handleToggleMemorizationMode = () => {
    setMemorizationMode(!memorizationMode);
    if (!memorizationMode) {
      // Hide all ayahs when entering memorization mode
      const pageInfo = quranDataService.getPageInfo(currentPage);
      if (pageInfo) {
        setHiddenAyahs(pageInfo.ayahs.map(a => a.aya_no));
      }
    } else {
      setHiddenAyahs([]);
    }
  };

  const handleToggleAyahVisibility = (ayahNumber: number) => {
    setHiddenAyahs(prev =>
      prev.includes(ayahNumber)
        ? prev.filter(n => n !== ayahNumber)
        : [...prev, ayahNumber]
    );
  };

  const handleAyahClick = (ayah: { aya_no: number }) => {
    if (memorizationMode) {
      handleToggleAyahVisibility(ayah.aya_no);
    }
  };

  const handleSurahPlayClick = async (surahNumber: number) => {
    // Import audioService dynamically to avoid SSR issues
    const { audioService } = await import('@/services/audioService');
    await audioService.play(surahNumber);
  };

  const isBookmarked = storageService.isPageBookmarked(currentPage);
  const pageInfo = quranDataService.getPageInfo(currentPage);
  const currentSurah = pageInfo?.ayahs[0]?.sura_no || 1;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      {showSidebar && (
        <NavigationSidebar
          currentPage={currentPage}
          onPageSelect={(page) => {
            setCurrentPage(page);
            setShowSidebar(false);
          }}
          onClose={() => setShowSidebar(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Top Toolbar */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700 p-3">
          <div className="flex items-center justify-between max-w-6xl mx-auto">
            {/* Left Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Menu
              </button>

              <button
                onClick={handleToggleBookmark}
                className={`px-4 py-2 rounded transition-colors flex items-center gap-2 ${
                  isBookmarked
                    ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                }`}
                title={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
              >
                {isBookmarked ? '★' : '☆'}
                Bookmark
              </button>
            </div>

            {/* Center - App Title */}
            <div className="text-center">
              <h1 className="text-xl font-bold text-gray-800 dark:text-gray-200">
                Quran Memorization
              </h1>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Qalun Recitation • Al-Husari
              </p>
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleToggleMemorizationMode}
                className={`px-4 py-2 rounded transition-colors ${
                  memorizationMode
                    ? 'bg-orange-500 hover:bg-orange-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                }`}
              >
                {memorizationMode ? '🎤 Memorization ON' : '📖 Reading Mode'}
              </button>
            </div>
          </div>
        </div>

        {/* Page Viewer */}
        <div className="flex-1 overflow-hidden">
          <QuranPageViewer
            pageNumber={currentPage}
            onPageChange={setCurrentPage}
            memorizationMode={memorizationMode}
            hiddenAyahs={hiddenAyahs}
            onAyahClick={handleAyahClick}
            onSurahPlayClick={handleSurahPlayClick}
          />
        </div>

        {/* Audio Player */}
        <AudioPlayer surahNumber={currentSurah} />
      </div>
    </div>
  );
}
