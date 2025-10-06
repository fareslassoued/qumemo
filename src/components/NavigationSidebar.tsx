'use client';

import React, { useState, useEffect } from 'react';
import { quranDataService } from '@/services/quranDataService';
import { storageService } from '@/services/storageService';
import { Surah, Bookmark, Ayah } from '@/types/quran';

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
  const [activeTab, setActiveTab] = useState<'surahs' | 'pages' | 'bookmarks' | 'search'>(
    'surahs'
  );
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [ayahSearchQuery, setAyahSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Ayah[]>([]);

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

  const handleAyahSearch = () => {
    if (!ayahSearchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    // Check if it's surah:ayah notation (e.g., "2:14")
    const surahAyahMatch = ayahSearchQuery.match(/^(\d+):(\d+)$/);
    if (surahAyahMatch) {
      const surahNumber = parseInt(surahAyahMatch[1]);
      const ayahNumber = parseInt(surahAyahMatch[2]);
      const ayah = quranDataService.getAyah(surahNumber, ayahNumber);
      if (ayah) {
        setSearchResults([ayah]);
      } else {
        setSearchResults([]);
      }
    } else {
      // Search by ayah text
      const results = quranDataService.searchAyahs(ayahSearchQuery);
      setSearchResults(results.slice(0, 50)); // Limit to 50 results
    }
  };

  const handleSearchResultClick = (ayah: Ayah) => {
    const pageNum = parseInt(ayah.page);
    onPageSelect(pageNum);
    onClose?.();
  };

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
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setActiveTab('surahs')}
            className={`py-2 px-3 rounded text-sm font-medium transition-colors ${
              activeTab === 'surahs'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            Surahs
          </button>
          <button
            onClick={() => setActiveTab('pages')}
            className={`py-2 px-3 rounded text-sm font-medium transition-colors ${
              activeTab === 'pages'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            Pages
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`py-2 px-3 rounded text-sm font-medium transition-colors ${
              activeTab === 'search'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            Search
          </button>
          <button
            onClick={() => setActiveTab('bookmarks')}
            className={`py-2 px-3 rounded text-sm font-medium transition-colors ${
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

        {/* Search Tab */}
        {activeTab === 'search' && (
          <div className="p-4">
            <div className="mb-4">
              <input
                type="text"
                placeholder="Search ayahs or use format 2:14"
                value={ayahSearchQuery}
                onChange={(e) => setAyahSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAyahSearch()}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm mb-2"
              />
              <button
                onClick={handleAyahSearch}
                className="w-full py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm font-medium"
              >
                Search
              </button>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Examples: &quot;الحمد&quot; or &quot;2:14&quot; (Surah 2, Ayah 14)
              </div>
            </div>

            {searchResults.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found
                </div>
                {searchResults.map((ayah) => (
                  <button
                    key={ayah.id}
                    onClick={() => handleSearchResultClick(ayah)}
                    className="w-full p-3 text-right border border-gray-200 dark:border-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {ayah.sura_name_en} • {ayah.sura_no}:{ayah.aya_no} • Page {ayah.page}
                      </div>
                    </div>
                    <div className="quran-text text-base text-right leading-relaxed">
                      {ayah.aya_text}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {ayahSearchQuery && searchResults.length === 0 && (
              <div className="text-center text-gray-500 dark:text-gray-400 text-sm mt-4">
                No results found
              </div>
            )}
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
