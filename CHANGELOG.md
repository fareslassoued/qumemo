# Changelog

## [Unreleased] - 2025-10-06

### Added
- **On-Demand Audio Download System** 🎵
  - New `audioDownloadService` for downloading Quran audio files from Archive.org
  - Automatic detection when audio files are missing
  - User-friendly download dialog with progress tracking
  - Cache API integration for offline audio playback
  - Download progress indicator showing percentage and file size
  - Auto-play after successful download

- **Audio Download Dialog Component**
  - Visual progress bar during download
  - Surah information display (Arabic and English names)
  - Informative messaging about caching and offline access
  - Cancel and confirm actions
  - Disabled state during download

- **Enhanced Audio Service**
  - `downloadAudio()` method with progress callbacks
  - `isAudioAvailable()` check before playback
  - `audio-not-found` event emission
  - `download-progress`, `download-completed`, `download-failed` events
  - Automatic URL resolution (local files or cached blobs)

- **Cache Management**
  - Browser Cache API for storing downloaded audio
  - Persistent offline storage
  - `getCacheSize()` method for storage monitoring
  - `clearCache()` method for cache management

### Changed
- Modified `audioService.play()` to check for audio availability first
- Updated `AudioPlayer` component with download event listeners
- Improved error handling for missing audio files

### Fixed
- All TypeScript errors and lint warnings
- Unused function warnings in components
- Type safety improvements across services

### Technical Details

#### Files Added:
- `src/services/audioDownloadService.ts` - Download and cache management
- `src/components/AudioDownloadDialog.tsx` - UI for download prompts

#### Files Modified:
- `src/services/audioService.ts` - Integrated download service
- `src/components/AudioPlayer.tsx` - Added download dialog and event handling
- `src/app/page.tsx` - Connected ayah click handler
- `src/components/QuranPageViewer.tsx` - Fixed TypeScript types
- `src/services/storageService.ts` - Fixed TypeScript types

#### How It Works:
1. User clicks play on a surah
2. `audioService` checks if audio file exists
3. If not found, emits `audio-not-found` event
4. `AudioPlayer` shows download dialog
5. User confirms download
6. `audioDownloadService` downloads from Archive.org with progress tracking
7. File is cached using Cache API
8. Audio automatically plays after download
9. Future plays use cached version (offline capable)

#### Download Source:
- **Provider**: Archive.org (husari_qalun collection)
- **URL Pattern**: `https://archive.org/download/husari_qalun/{surah:03d}.mp3`
- **Reciter**: Mahmoud Khalil Al-Husari
- **Riwayah**: Qalun
- **Format**: VBR MP3

### Testing Instructions:
1. Start the app: `npm run dev`
2. Navigate to page 4 or later (surahs 4-114 don't have audio pre-downloaded)
3. Click the Play button
4. Download dialog should appear
5. Click "Download" to start downloading
6. Progress bar should show download status
7. Audio should auto-play after download
8. Next time, audio plays immediately (from cache)

### Performance Notes:
- Downloads happen in the background with streaming
- Progress updates in real-time
- No page blocking during download
- Files cached permanently until manually cleared
- Average surah size: 5-40 MB
- Total collection: ~596 MB (all 114 surahs)

### Future Improvements:
- [ ] Batch download option (download multiple surahs at once)
- [ ] Download queue management
- [ ] Storage usage indicator in settings
- [ ] Automatic cleanup of old cached files
- [ ] Resume failed downloads
- [ ] Background download while browsing
- [ ] Prefetch next/previous surah
- [ ] Download entire Juz option

---

## Previous Work (2025-10-06)

### Initial Setup
- Created Next.js 15 project with TypeScript and Tailwind CSS
- Downloaded Qalun text data (QaloonData_v10.json - 6,236 verses)
- Downloaded KFGQPC Qalun fonts (TTF and WOFF2)
- Downloaded sample audio files (surahs 1-3)
- Set up project structure (components, services, types, data)

### Core Features Implemented
- Quran page viewer with Mushaf layout (604 pages)
- Audio player with controls
- Navigation sidebar (Surahs, Pages, Bookmarks)
- Bookmark system with local storage
- Memorization mode (hide/show ayahs)
- Dark mode support
- RTL layout for Arabic text
- TypeScript type definitions
- Data services for Quran text queries
- Storage service with IndexedDB support
- Recording service for voice capture

---

**Status**: Feature-complete for on-demand audio download
**Next**: Testing and user feedback collection
