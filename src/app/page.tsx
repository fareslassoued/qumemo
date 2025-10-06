'use client';

import React, { useState } from 'react';
import { QuranPageViewer } from '@/components/QuranPageViewer';
import { AudioPlayer } from '@/components/AudioPlayer';
import { NavigationSidebar } from '@/components/NavigationSidebar';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { storageService } from '@/services/storageService';
import { quranDataService } from '@/services/quranDataService';
import { Ayah } from '@/types/quran';

export default function Home() {
  const [currentPage, setCurrentPage] = useState(1);
  const [showSidebar, setShowSidebar] = useState(false);
  const [memorizationMode, setMemorizationMode] = useState(false);
  const [hiddenAyahs, setHiddenAyahs] = useState<number[]>([]);
  const [showRecorder, setShowRecorder] = useState(false);

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

  const handleAyahClick = (ayah: Ayah) => {
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

            {/* Right Actions */}
            <div className="flex items-center gap-1 sm:gap-2">
              {memorizationMode && (
                <button
                  onClick={() => setShowRecorder(!showRecorder)}
                  className={`px-2 sm:px-4 py-2 rounded transition-colors flex items-center gap-1 text-sm sm:text-base ${
                    showRecorder
                      ? 'bg-red-500 hover:bg-red-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="hidden sm:inline">{showRecorder ? 'Hide' : 'Record'}</span>
                </button>
              )}

              <button
                onClick={handleToggleMemorizationMode}
                className={`px-2 sm:px-4 py-2 rounded transition-colors text-xs sm:text-base ${
                  memorizationMode
                    ? 'bg-orange-500 hover:bg-orange-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                }`}
              >
                <span className="hidden sm:inline">{memorizationMode ? '🎤 Memorization ON' : '📖 Reading Mode'}</span>
                <span className="sm:hidden">{memorizationMode ? '🎤' : '📖'}</span>
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

          {/* Voice Recorder Sidebar - Mobile bottom sheet, desktop sidebar */}
          {memorizationMode && showRecorder && (
            <>
              {/* Mobile backdrop */}
              <div
                className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
                onClick={() => setShowRecorder(false)}
              />
              <div className="fixed lg:relative bottom-0 inset-x-0 lg:inset-auto lg:w-96 max-h-[70vh] lg:max-h-none lg:h-full border-t lg:border-t-0 lg:border-l border-gray-300 dark:border-gray-700 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-4 rounded-t-2xl lg:rounded-none z-50 lg:z-0">
                <div className="sticky top-0 bg-gray-50 dark:bg-gray-900 pb-4 mb-4 border-b border-gray-300 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200">
                      Page {currentPage} Recording
                    </h2>
                    <button
                      onClick={() => setShowRecorder(false)}
                      className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Practice reciting the entire page
                  </div>
                </div>

                <VoiceRecorder
                  pageNumber={currentPage}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
