'use client';

import React, { useState, useEffect } from 'react';
import { quranDataService } from '@/services/quranDataService';
import { storageService } from '@/services/storageService';
import { Surah, Bookmark } from '@/types/quran';

interface NavigationSidebarProps {
  currentPage: number;
  onPageSelect: (page: number) => void;
  onClose?: () => void;
}

export function NavigationSidebar({
  currentPage,
  onPageSelect,
  onClose,
}: NavigationSidebarProps) {
  const [activeTab, setActiveTab] = useState<'surahs' | 'pages' | 'bookmarks'>(
    'surahs'
  );
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setSurahs(quranDataService.getAllSurahs());
    setBookmarks(storageService.getBookmarks());
  }, []);

  const handleSurahClick = (surahNumber: number) => {
    const firstAyah = quranDataService.getAyah(surahNumber, 1);
    if (firstAyah) {
      const pageNum = parseInt(firstAyah.page);
      onPageSelect(pageNum);
      onClose?.();
    }
  };

  const handleBookmarkClick = (bookmark: Bookmark) => {
    onPageSelect(bookmark.pageNumber);
    onClose?.();
  };

  const handleDeleteBookmark = (id: string) => {
    storageService.removeBookmark(id);
    setBookmarks(storageService.getBookmarks());
  };

  const filteredSurahs = surahs.filter(
    (surah) =>
      surah.name.includes(searchQuery) ||
      surah.englishName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-80 bg-white dark:bg-gray-800 border-r border-gray-300 dark:border-gray-700 flex flex-col h-screen">
      {/* Header */}
      <div className="p-4 border-b border-gray-300 dark:border-gray-700">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">
            Navigation
          </h2>
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            >
              ✕
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('surahs')}
            className={`flex-1 py-2 px-3 rounded text-sm font-medium transition-colors ${
              activeTab === 'surahs'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            Surahs
          </button>
          <button
            onClick={() => setActiveTab('pages')}
            className={`flex-1 py-2 px-3 rounded text-sm font-medium transition-colors ${
              activeTab === 'pages'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            Pages
          </button>
          <button
            onClick={() => setActiveTab('bookmarks')}
            className={`flex-1 py-2 px-3 rounded text-sm font-medium transition-colors ${
              activeTab === 'bookmarks'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            Bookmarks
          </button>
        </div>

        {/* Search */}
        {activeTab === 'surahs' && (
          <div className="mt-4">
            <input
              type="text"
              placeholder="Search surahs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm"
            />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Surahs List */}
        {activeTab === 'surahs' && (
          <div>
            {filteredSurahs.map((surah) => (
              <button
                key={surah.number}
                onClick={() => handleSurahClick(surah.number)}
                className="w-full px-4 py-3 text-right border-b border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-bold">
                      {surah.number}
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {surah.englishName}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {surah.numberOfAyahs} ayahs • {surah.revelationType}
                      </div>
                    </div>
                  </div>
                  <div className="text-lg quran-text">{surah.name}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Pages List */}
        {activeTab === 'pages' && (
          <div className="grid grid-cols-5 gap-2 p-4">
            {Array.from(
              { length: quranDataService.getTotalPages() },
              (_, i) => i + 1
            ).map((page) => (
              <button
                key={page}
                onClick={() => {
                  onPageSelect(page);
                  onClose?.();
                }}
                className={`py-2 px-3 rounded text-sm font-medium transition-colors ${
                  page === currentPage
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                {page}
              </button>
            ))}
          </div>
        )}

        {/* Bookmarks List */}
        {activeTab === 'bookmarks' && (
          <div>
            {bookmarks.length === 0 ? (
              <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                No bookmarks yet
              </div>
            ) : (
              bookmarks.map((bookmark) => (
                <div
                  key={bookmark.id}
                  className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <div className="flex justify-between items-start">
                    <button
                      onClick={() => handleBookmarkClick(bookmark)}
                      className="flex-1 text-left"
                    >
                      <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Page {bookmark.pageNumber}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Surah {bookmark.surahNumber}:{bookmark.ayahNumber}
                      </div>
                      {bookmark.note && (
                        <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          {bookmark.note}
                        </div>
                      )}
                    </button>
                    <button
                      onClick={() => handleDeleteBookmark(bookmark.id)}
                      className="text-red-500 hover:text-red-700 ml-2"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
