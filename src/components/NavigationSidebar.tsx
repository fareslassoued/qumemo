'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { quranDataService } from '@/services/quranDataService';
import { storageService } from '@/services/storageService';
import { Surah, Bookmark, Ayah } from '@/types/quran';

interface NavigationSidebarProps {
  currentPage: number;
  onPageSelect: (page: number) => void;
  onClose?: () => void;
}

const TAB_STYLE_ACTIVE = {
  background: 'var(--gold)',
  color: 'var(--parchment)',
};
const TAB_STYLE_IDLE = {
  background: 'transparent',
  color: 'var(--dim)',
  borderBottom: '1px solid var(--divider)',
};

export function NavigationSidebar({
  currentPage,
  onPageSelect,
  onClose,
}: NavigationSidebarProps) {
  const [activeTab, setActiveTab] = useState<'surahs' | 'juz' | 'pages' | 'bookmarks' | 'search'>('surahs');
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [ayahSearchQuery, setAyahSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Ayah[]>([]);

  // Precompute juz → starting page + first surah name
  const juzData = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => {
      const juzNo = i + 1;
      const ayahs = quranDataService.getJuzAyahs(juzNo);
      if (!ayahs.length) return null;
      const first = ayahs[0];
      return {
        juz: juzNo,
        page: parseInt(first.page),
        surahNo: first.sura_no,
        surahName: first.sura_name_en,
        ayahNo: first.aya_no,
      };
    }).filter(Boolean) as { juz: number; page: number; surahNo: number; surahName: string; ayahNo: number }[];
  }, []);

  useEffect(() => {
    setSurahs(quranDataService.getAllSurahs());
    setBookmarks(storageService.getBookmarks());
  }, []);

  const handleSurahClick = (surahNumber: number) => {
    const firstAyah = quranDataService.getAyah(surahNumber, 1);
    if (firstAyah) {
      onPageSelect(parseInt(firstAyah.page));
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
    (s) =>
      s.name.includes(searchQuery) ||
      s.englishName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAyahSearch = () => {
    if (!ayahSearchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const surahAyahMatch = ayahSearchQuery.match(/^(\d+):(\d+)$/);
    if (surahAyahMatch) {
      const ayah = quranDataService.getAyah(
        parseInt(surahAyahMatch[1]),
        parseInt(surahAyahMatch[2])
      );
      setSearchResults(ayah ? [ayah] : []);
    } else {
      setSearchResults(quranDataService.searchAyahs(ayahSearchQuery).slice(0, 50));
    }
  };

  const handleSearchResultClick = (ayah: Ayah) => {
    onPageSelect(parseInt(ayah.page));
    onClose?.();
  };

  const inputStyle = {
    background: 'var(--surface)',
    color: 'var(--ink)',
    border: '1px solid var(--divider)',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '0.85rem',
    fontFamily: 'var(--font-garamond), Georgia, serif',
    outline: 'none',
    width: '100%',
  };

  return (
    <div
      className="flex flex-col h-screen w-80"
      style={{ background: 'var(--bar-bg)', borderLeft: '1px solid var(--divider)' }}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3" style={{ borderBottom: '1px solid var(--divider)' }}>
        <div className="flex justify-between items-center mb-4">
          <h2
            className="text-base font-medium tracking-widest uppercase"
            style={{
              color: 'var(--gold)',
              fontFamily: 'var(--font-garamond), Georgia, serif',
              letterSpacing: '0.2em',
            }}
          >
            Navigate
          </h2>
          {onClose && (
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-full transition-colors"
              style={{ color: 'var(--dim)' }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-5 gap-0 rounded-lg overflow-hidden" style={{ border: '1px solid var(--divider)' }}>
          {([
            { id: 'surahs',    label: 'Sur' },
            { id: 'juz',       label: 'Juz' },
            { id: 'pages',     label: 'Pg'  },
            { id: 'search',    label: '⌕'   },
            { id: 'bookmarks', label: '★'   },
          ] as const).map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className="py-2 text-xs font-medium transition-colors"
              style={activeTab === id ? TAB_STYLE_ACTIVE : TAB_STYLE_IDLE}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Surah filter */}
        {activeTab === 'surahs' && (
          <div className="mt-3">
            <input
              type="text"
              placeholder="Filter surahs…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={inputStyle}
            />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">

        {/* Surahs */}
        {activeTab === 'surahs' && (
          <div>
            {filteredSurahs.map((surah) => (
              <button
                key={surah.number}
                onClick={() => handleSurahClick(surah.number)}
                className="w-full px-4 py-3 text-right transition-colors"
                style={{ borderBottom: '1px solid var(--divider)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div className="flex justify-between items-center gap-3" dir="ltr">
                  <div className="flex items-center gap-2.5 shrink-0">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium"
                      style={{ background: 'var(--gold)', color: 'var(--parchment)' }}
                    >
                      {surah.number}
                    </div>
                    <div className="text-left">
                      <div
                        className="text-sm font-medium"
                        style={{
                          color: 'var(--ink)',
                          fontFamily: 'var(--font-garamond), Georgia, serif',
                        }}
                      >
                        {surah.englishName}
                      </div>
                      <div
                        className="text-[11px]"
                        style={{
                          color: 'var(--dim)',
                          fontFamily: 'var(--font-garamond), Georgia, serif',
                        }}
                      >
                        {surah.numberOfAyahs} ayahs
                      </div>
                    </div>
                  </div>
                  <div
                    className="quran-text text-lg shrink-0"
                    style={{ color: 'var(--ink)', lineHeight: 1.8 }}
                  >
                    {surah.name}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Juz list */}
        {activeTab === 'juz' && (
          <div>
            {juzData.map(({ juz, page, surahName, ayahNo }) => {
              const isCurrent = quranDataService.getPageInfo(currentPage)?.juz === juz;
              return (
                <button
                  key={juz}
                  onClick={() => { onPageSelect(page); onClose?.(); }}
                  className="w-full px-4 py-3 flex items-center gap-3 transition-colors"
                  style={{
                    borderBottom: '1px solid var(--divider)',
                    background: isCurrent ? 'var(--surface)' : 'transparent',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = isCurrent ? 'var(--surface)' : 'transparent')}
                >
                  {/* Juz number badge */}
                  <div
                    className="w-9 h-9 rounded-full flex flex-col items-center justify-center shrink-0 text-center"
                    style={{
                      background: isCurrent ? 'var(--gold)' : 'var(--divider)',
                      color: isCurrent ? 'var(--parchment)' : 'var(--dim)',
                    }}
                  >
                    <span className="text-[9px] leading-none" style={{ fontFamily: 'var(--font-garamond), Georgia, serif' }}>JUZ</span>
                    <span className="text-sm font-medium leading-tight" style={{ fontFamily: 'var(--font-garamond), Georgia, serif' }}>{juz}</span>
                  </div>

                  {/* Info */}
                  <div className="text-left flex-1 min-w-0">
                    <div
                      className="text-sm font-medium truncate"
                      style={{ color: 'var(--ink)', fontFamily: 'var(--font-garamond), Georgia, serif' }}
                    >
                      {surahName} {ayahNo > 1 ? `· ${ayahNo}` : ''}
                    </div>
                    <div
                      className="text-[11px]"
                      style={{ color: 'var(--dim)', fontFamily: 'var(--font-garamond), Georgia, serif' }}
                    >
                      Page {page}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Pages grid */}
        {activeTab === 'pages' && (
          <div className="grid grid-cols-5 gap-1.5 p-4">
            {Array.from({ length: quranDataService.getTotalPages() }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => { onPageSelect(page); onClose?.(); }}
                className="py-2 rounded text-xs font-medium transition-colors"
                style={
                  page === currentPage
                    ? { background: 'var(--gold)', color: 'var(--parchment)' }
                    : {
                        background: 'var(--surface)',
                        color: 'var(--dim)',
                        fontFamily: 'var(--font-garamond), Georgia, serif',
                      }
                }
              >
                {page}
              </button>
            ))}
          </div>
        )}

        {/* Search */}
        {activeTab === 'search' && (
          <div className="p-4">
            <div className="mb-4 space-y-2">
              <input
                type="text"
                placeholder="Arabic text or 2:14"
                value={ayahSearchQuery}
                onChange={(e) => setAyahSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAyahSearch()}
                style={inputStyle}
              />
              <button
                onClick={handleAyahSearch}
                className="w-full py-2 rounded text-sm font-medium transition-colors"
                style={{
                  background: 'var(--gold)',
                  color: 'var(--parchment)',
                  fontFamily: 'var(--font-garamond), Georgia, serif',
                }}
              >
                Search
              </button>
              <div
                className="text-[11px]"
                style={{ color: 'var(--dim)', fontFamily: 'var(--font-garamond), Georgia, serif' }}
              >
                Examples: &quot;الحمد&quot; or &quot;2:14&quot;
              </div>
            </div>

            {searchResults.length > 0 && (
              <div className="space-y-2">
                <div
                  className="text-xs mb-2"
                  style={{ color: 'var(--dim)', fontFamily: 'var(--font-garamond), Georgia, serif' }}
                >
                  {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                </div>
                {searchResults.map((ayah) => (
                  <button
                    key={ayah.id}
                    onClick={() => handleSearchResultClick(ayah)}
                    className="w-full p-3 rounded-lg text-right transition-colors"
                    style={{ background: 'var(--surface)', border: '1px solid var(--divider)' }}
                  >
                    <div
                      className="text-[11px] mb-2"
                      style={{ color: 'var(--dim)', fontFamily: 'var(--font-garamond), Georgia, serif' }}
                    >
                      {ayah.sura_name_en} · {ayah.sura_no}:{ayah.aya_no} · P.{ayah.page}
                    </div>
                    <div className="quran-text text-base leading-loose" style={{ color: 'var(--ink)' }}>
                      {ayah.aya_text}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {ayahSearchQuery && searchResults.length === 0 && (
              <div
                className="text-center text-sm mt-4"
                style={{ color: 'var(--dim)', fontFamily: 'var(--font-garamond), Georgia, serif' }}
              >
                No results found
              </div>
            )}
          </div>
        )}

        {/* Bookmarks */}
        {activeTab === 'bookmarks' && (
          <div>
            {bookmarks.length === 0 ? (
              <div
                className="p-6 text-center text-sm"
                style={{ color: 'var(--dim)', fontFamily: 'var(--font-garamond), Georgia, serif' }}
              >
                No bookmarks yet
              </div>
            ) : (
              bookmarks.map((bookmark) => (
                <div
                  key={bookmark.id}
                  className="flex items-start px-4 py-3 gap-2"
                  style={{ borderBottom: '1px solid var(--divider)' }}
                >
                  <button onClick={() => handleBookmarkClick(bookmark)} className="flex-1 text-left">
                    <div
                      className="text-sm font-medium"
                      style={{
                        color: 'var(--ink)',
                        fontFamily: 'var(--font-garamond), Georgia, serif',
                      }}
                    >
                      Page {bookmark.pageNumber}
                    </div>
                    <div
                      className="text-xs"
                      style={{ color: 'var(--dim)', fontFamily: 'var(--font-garamond), Georgia, serif' }}
                    >
                      Surah {bookmark.surahNumber}:{bookmark.ayahNumber}
                    </div>
                    {bookmark.note && (
                      <div
                        className="text-xs mt-0.5 italic"
                        style={{ color: 'var(--dim)', fontFamily: 'var(--font-garamond), Georgia, serif' }}
                      >
                        {bookmark.note}
                      </div>
                    )}
                  </button>
                  <button
                    onClick={() => handleDeleteBookmark(bookmark.id)}
                    className="text-xs shrink-0 mt-0.5 transition-colors"
                    style={{ color: 'var(--dim)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--ink)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--dim)')}
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
