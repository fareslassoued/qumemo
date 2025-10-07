'use client';

import React, { useState } from 'react';
import { QuranPageViewer } from '@/components/QuranPageViewer';
import { AudioPlayer } from '@/components/AudioPlayer';
import { NavigationSidebar } from '@/components/NavigationSidebar';
import { storageService } from '@/services/storageService';
import { quranDataService } from '@/services/quranDataService';
import Link from 'next/link';

export default function Home() {
  const [currentPage, setCurrentPage] = useState(1);
  const [showSidebar, setShowSidebar] = useState(false);

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
      {/* Sidebar - Mobile overlay, desktop sidebar */}
      {showSidebar && (
        <>
          {/* Mobile backdrop */}
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
            onClick={() => setShowSidebar(false)}
          />
          <div className="fixed lg:relative inset-y-0 left-0 z-50 lg:z-0">
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

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex flex-1 overflow-hidden">
          {/* Quran Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Toolbar */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700 p-2 sm:p-3">
          <div className="flex items-center justify-between w-full">
            {/* Left Actions */}
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className="px-2 sm:px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors flex items-center gap-1 sm:gap-2 text-sm sm:text-base"
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span className="hidden sm:inline">Menu</span>
              </button>

              <Link
                href="/memorization"
                className="px-2 sm:px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded transition-colors flex items-center gap-1 text-sm sm:text-base"
              >
                <span>🧠</span>
                <span className="hidden sm:inline">Memorize</span>
              </Link>

              <button
                onClick={handleToggleBookmark}
                className={`px-2 sm:px-4 py-2 rounded transition-colors flex items-center gap-1 text-sm sm:text-base ${
                  isBookmarked
                    ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                }`}
                title={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
              >
                {isBookmarked ? '★' : '☆'}
                <span className="hidden sm:inline">Bookmark</span>
              </button>
            </div>

            {/* Center - App Title (hidden on mobile) */}
            <div className="text-center hidden md:block">
              <h1 className="text-lg lg:text-xl font-bold text-gray-800 dark:text-gray-200">
                Quran Memorization
              </h1>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Qalun Recitation • Al-Husari
              </p>
            </div>

          </div>
        </div>

            {/* Page Viewer */}
            <div className="flex-1 overflow-hidden">
              <QuranPageViewer
                pageNumber={currentPage}
                onPageChange={setCurrentPage}
                onSurahPlayClick={handleSurahPlayClick}
              />
            </div>

            {/* Audio Player */}
            <AudioPlayer surahNumber={currentSurah} />
          </div>

        </div>
      </div>
    </div>
  );
}
