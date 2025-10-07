# Development Progress & Next Steps

## Current Status: Phase 1 Complete ✅

### What's Been Completed

#### ✅ Phase 1: Foundation & Data Layer (100%)
- [x] Next.js 15 project initialized with TypeScript
- [x] Project structure created (components, services, types, data folders)
- [x] Qalun text data downloaded (QaloonData_v10.json - 6,236 verses)
- [x] KFGQPC Qalun fonts added (qaloon.10.woff2, qaloon.10.ttf)
- [x] Sample audio downloaded (surahs 1-3, total ~63MB)
- [x] Metadata downloaded (quran-info.json)

#### ✅ Phase 2: Services Layer (100%)
- [x] `quranDataService.ts` - Complete data querying system
  - Get pages, surahs, ayahs, juz
  - Search functionality
  - Navigation helpers (next/previous ayah)
- [x] `audioService.ts` - Audio playback management
  - Play/pause/stop controls
  - Volume and speed control
  - Event system for UI updates
  - Repeat modes (ayah, section)
- [x] `recordingService.ts` - Voice recording for memorization
  - Microphone access
  - Start/stop recording
  - Playback and download
- [x] `storageService.ts` - Persistence layer
  - LocalStorage for bookmarks and settings
  - IndexedDB for audio blobs
  - CRUD operations for all data types

#### ✅ Phase 3: UI Components (100%)
- [x] `QuranPageViewer.tsx` - Main Quran display
  - 604-page navigation
  - Surah headers and Bismillah
  - Memorization mode (hide/show ayahs)
  - Highlighting support
- [x] `AudioPlayer.tsx` - Audio controls
  - Play/pause/stop buttons
  - Progress bar with seek
  - Volume slider
  - Speed control (0.5x - 1.5x)
  - Settings panel
- [x] `NavigationSidebar.tsx` - Navigation menu
  - 3 tabs: Surahs, Pages, Bookmarks
  - Search functionality
  - 114 surahs listed with info
  - Grid view for 604 pages
  - Bookmark management

#### ✅ Phase 4: Integration & Styling (100%)
- [x] Main page (`page.tsx`) with full integration
- [x] Qalun font configured in Next.js
- [x] Global CSS with Arabic text styling
- [x] RTL layout support
- [x] Dark mode support
- [x] Responsive design
- [x] Bookmark toggle functionality
- [x] Memorization mode toggle

#### ✅ Phase 5: Documentation (100%)
- [x] Comprehensive README.md
- [x] Usage guide
- [x] Data sources documented
- [x] Installation instructions
- [x] Development guide

---

## Known Issues & Limitations

### 🔴 Critical Issues
None currently - app is functional

### 🟡 Minor Issues
1. **Audio Coverage**: Only 3 surahs (1-3) have audio files
   - Need to download remaining 111 surahs (533MB)
   - See "Next Steps" below for download script

2. **Unused Function Warning**:
   - `handleToggleAyahVisibility` in `page.tsx:51` declared but not used
   - Can be removed or connected to ayah click handler

3. **Audio Timing**:
   - Current audio plays entire surah, not individual ayahs
   - Need ayah-level timing data for precise highlighting
   - Would require timestamp mapping file

### 🟢 Future Enhancements
- Voice recording UI not integrated into main page
- No ayah-by-ayah audio segments (plays full surah)
- No progress tracking or statistics
- No translation/tafsir integration
- No search by ayah content (only surah names)
- No keyboard shortcuts
- No PWA/offline mode

---

## Next Development Session - Priority Tasks

### 🎯 TOP PRIORITY: Ayah-by-Ayah Audio Playback

**Goal**: Implement individual ayah playback with repeat functionality for proper memorization support.

**Current Limitation**:
- Audio files are per-surah (001.mp3, 002.mp3, etc.)
- Cannot play individual ayahs or jump between ayahs
- Repeat functionality only works for entire surahs
- This blocks the core memorization workflow (repeat ayah 1-7, then 7-12, etc.)

**Solution Approach: Ayah Timestamp Data (RECOMMENDED)**

Use existing surah audio files with timestamp mapping for each ayah.

**Pros:**
- No additional audio files needed (~596MB saved)
- Smaller storage footprint
- Faster implementation
- Works with existing Qalun audio

**Implementation Plan** (4-6 hours):

1. **Find/Create Ayah Timestamps** (1-2 hours)
   - Search for Qalun (Al-Husari) ayah timing data
   - Possible sources:
     - Quran.com API: `https://api.quran.com/api/v4/quran/timings/{recitation_id}`
     - Every Ayah Project: https://github.com/everyayah/everyayah.github.io
     - Tanzil Project: https://tanzil.net/
   - Format needed: JSON file mapping `{surah: number, ayah: number, startTime: number, endTime: number}`
   - Example structure:
     ```json
     {
       "1": [
         {"ayah": 1, "startTime": 0.5, "endTime": 4.2},
         {"ayah": 2, "startTime": 4.3, "endTime": 8.1}
       ]
     }
     ```

2. **Create Timing Service** (1 hour)
   - File: `src/services/ayahTimingService.ts`
   ```typescript
   class AyahTimingService {
     private timings: Map<string, AyahTiming> = new Map();

     async loadTimings(surahNumber: number): Promise<void>
     getAyahTiming(surah: number, ayah: number): AyahTiming | null
     getAyahAtTime(surah: number, currentTime: number): number
   }
   ```

3. **Update AudioService** (2 hours)
   - Modify `src/services/audioService.ts`
   ```typescript
   // Add ayah playback
   async playAyah(surah: number, ayah: number): Promise<void> {
     const timing = ayahTimingService.getAyahTiming(surah, ayah);
     if (timing) {
       this.audio.currentTime = timing.startTime;
       this.setupAyahEndListener(timing.endTime);
     }
   }

   private setupAyahEndListener(endTime: number): void {
     const checkTime = () => {
       if (this.audio.currentTime >= endTime) {
         this.audio.pause();
         this.handleAyahEnded();
       }
     };
     this.ayahEndCheckInterval = setInterval(checkTime, 100);
   }

   private handleAyahEnded(): void {
     clearInterval(this.ayahEndCheckInterval);

     // Repeat ayah logic
     if (this.settings.repeatAyah) {
       this.repeatCounter++;
       if (this.repeatCounter < this.settings.repeatCount) {
         this.playAyah(this.currentSurah, this.currentAyah);
         return;
       }
       this.repeatCounter = 0;
     }

     // Section repeat logic
     if (this.settings.repeatSection) {
       const { sectionEnd } = this.settings;
       if (this.currentAyah >= sectionEnd.ayah) {
         // Loop back to section start
         this.playAyah(this.settings.sectionStart.surah,
                      this.settings.sectionStart.ayah);
         return;
       }
     }

     // Move to next ayah
     this.playNextAyah();
   }
   ```

4. **Update AudioPlayer UI** (1 hour)
   - File: `src/components/AudioPlayer.tsx`
   - Changes:
     - Re-enable "Repeat Ayah" (rename from "Repeat Surah")
     - Re-enable "Repeat Section" with ayah range inputs
     - Add Previous/Next Ayah navigation buttons
     - Remove the yellow warning note
     - Show current ayah number in player

5. **Add Type Definitions** (15 minutes)
   - File: `src/types/quran.ts`
   ```typescript
   export interface AyahTiming {
     ayah: number;
     startTime: number;
     endTime: number;
   }

   export interface SurahTimings {
     surah: number;
     ayahs: AyahTiming[];
   }
   ```

**Testing Checklist**:
- [ ] Play individual ayah from any surah
- [ ] Repeat single ayah X times (1, 2, 3, 5, 7, 10, 20)
- [ ] Repeat section (e.g., ayah 1-7) with each ayah repeated X times
- [ ] Navigate between ayahs (Previous/Next buttons)
- [ ] Timing accuracy - ayah starts/ends at correct time (±0.5s acceptable)
- [ ] Smooth transitions between ayahs in section repeat mode
- [ ] Works in both reading mode and memorization sessions
- [ ] Playback speed affects ayah timing correctly

**Files to Create/Modify**:
1. `src/services/ayahTimingService.ts` (NEW)
2. `src/services/audioService.ts` (UPDATE - major changes)
3. `src/components/AudioPlayer.tsx` (UPDATE - UI for ayah controls)
4. `src/types/quran.ts` (ADD AyahTiming types)
5. `public/data/timings/*.json` (NEW - timing data files)

**Alternative: Individual Ayah Files** (If timing data unavailable)
- Use EveryAyah.com: `https://everyayah.com/data/Husary_128kbps/{surah:03d}{ayah:03d}.mp3`
- Pros: Perfect accuracy, simpler logic
- Cons: ~6,236 files, ~500MB-1GB storage, different reciter than Qalun

---

### 🎯 Other Priority Tasks (After ayah playback)

#### Option 1: Complete Audio Download (High Priority)
**Time**: ~30-60 minutes (depending on connection)
**Impact**: Makes app fully functional for all surahs

```bash
cd public/audio

# Download all 114 surahs (596 MB total)
for i in {4..114}; do
  echo "Downloading surah $i..."
  curl -L -o $(printf "%03d.mp3" $i) \
    https://archive.org/download/husari_qalun/$(printf "%03d.mp3" $i)
  sleep 1  # Be nice to the server
done
```

#### Option 2: Add Search by Ayah Text (1-2 hours)
**Files to modify**:
- `src/components/NavigationSidebar.tsx` - Add search tab
- Use existing `quranDataService.searchAyahs()` method

#### Option 3: Progress Tracking & Statistics (2-3 hours)
- Track which pages/surahs have been memorized
- Show progress percentage
- Memorization streaks
- Review schedule based on spaced repetition

---

## File Structure Reference

### Key Files to Know

```
src/
├── app/
│   ├── page.tsx              # Main app - START HERE
│   ├── layout.tsx            # Root layout with fonts
│   ├── fonts.ts              # Font configuration
│   └── globals.css           # Global styles + Quran text CSS
├── components/
│   ├── QuranPageViewer.tsx   # Main Quran display
│   ├── AudioPlayer.tsx       # Audio controls
│   └── NavigationSidebar.tsx # Navigation menu
├── services/
│   ├── quranDataService.ts   # Data queries (most important)
│   ├── audioService.ts       # Audio playback logic
│   ├── recordingService.ts   # Voice recording
│   └── storageService.ts     # LocalStorage + IndexedDB
├── types/
│   └── quran.ts             # All TypeScript interfaces
└── data/
    ├── quran/
    │   └── QaloonData_v10.json  # Full Quran text (2.7MB)
    └── layout/
        └── quran-info.json      # Metadata (2.3MB)
```

### Data Format Examples

#### Ayah Object (from QaloonData_v10.json)
```json
{
  "id": 1,
  "jozz": 1,
  "page": "1",
  "sura_no": 1,
  "sura_name_en": "Al-Fātiḥah",
  "sura_name_ar": "الفَاتِحة",
  "line_start": 3,
  "line_end": 3,
  "aya_no": 1,
  "aya_text": "بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ ١"
}
```

#### Service Usage Examples
```typescript
// Get page data
const pageInfo = quranDataService.getPageInfo(1);
// Returns: { pageNumber, ayahs[], juz, surahsOnPage[] }

// Get specific ayah
const ayah = quranDataService.getAyah(1, 1); // Surah 1, Ayah 1

// Search
const results = quranDataService.searchAyahs("الله");

// Play audio
await audioService.play(1); // Play Surah 1

// Add bookmark
storageService.addBookmark({
  surahNumber: 1,
  ayahNumber: 1,
  pageNumber: 1,
  note: "My favorite page"
});
```

---

## Testing Checklist

Before considering features "complete", test:

### Basic Navigation
- [ ] Next/Previous page buttons work
- [ ] Jump to specific page via sidebar
- [ ] Jump to surah via sidebar
- [ ] Bookmarks save and load correctly
- [ ] Search finds correct surahs

### Audio Playback
- [ ] Play/pause works
- [ ] Volume control works
- [ ] Speed control works (0.5x - 1.5x)
- [ ] Seek bar updates in real-time
- [ ] Audio plays for all 114 surahs (after download)

### Memorization Mode
- [ ] Toggle activates/deactivates
- [ ] Ayahs hide on activation
- [ ] Hidden ayahs show placeholder
- [ ] Mode persists when changing pages

### Responsive Design
- [ ] Desktop layout looks good
- [ ] Tablet layout works
- [ ] Mobile layout is usable
- [ ] Sidebar closes on mobile after selection

### Dark Mode
- [ ] Toggle works
- [ ] All text is readable
- [ ] Colors contrast properly
- [ ] Font rendering is clear

---

## Performance Optimization Ideas

### Current Performance
- Initial load: ~3-4MB (Quran data + fonts)
- Page load: Instant (data in memory)
- Audio: Streams from public folder

### Optimizations for Later
1. **Lazy load Quran data** by juz (split JSON into 30 files)
2. **Virtual scrolling** for long ayah lists
3. **Service Worker** for offline PWA
4. **Compress audio** to opus/webm format
5. **CDN** for fonts and audio
6. **Code splitting** by route

---

## Deployment Checklist

When ready to deploy:

### Pre-deployment
1. [ ] Download all 114 audio files
2. [ ] Test in production mode (`npm run build && npm start`)
3. [ ] Verify all images/fonts load correctly
4. [ ] Check bundle size (`npm run build` shows sizes)
5. [ ] Test on mobile devices
6. [ ] Fix all TypeScript errors (`npm run lint`)

### Deployment Options

#### Vercel (Recommended - Easiest)
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Follow prompts, done!
```

#### Static Export (For any host)
```bash
# Add to next.config.ts:
# output: 'export'

npm run build
# Upload 'out' folder to any static host
```

#### Docker (For self-hosting)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

---

## Resources & References

### Documentation
- [Next.js Docs](https://nextjs.org/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Tailwind CSS](https://tailwindcss.com/docs)

### Quran Data Sources
- **KFGQPC Repo**: https://github.com/thetruetruth/quran-data-kfgqpc
- **Archive.org Audio**: https://archive.org/details/husari_qalun
- **Quran API**: https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@1/
- **EveryAyah.com**: https://everyayah.com/data/

### Arabic Fonts
- **Amiri**: https://www.amirifont.org/
- **Scheherazade**: https://software.sil.org/scheherazade/
- **Noto Naskh Arabic**: https://fonts.google.com/noto/specimen/Noto+Naskh+Arabic

---

## Quick Commands Reference

```bash
# Development
npm run dev          # Start dev server (http://localhost:3000)
npm run build        # Build for production
npm start           # Start production server
npm run lint        # Check for errors

# Download remaining audio
cd public/audio && for i in {4..114}; do curl -L -o $(printf "%03d.mp3" $i) https://archive.org/download/husari_qalun/$(printf "%03d.mp3" $i); done

# Check bundle size
npm run build        # See output for sizes

# Clear cache
rm -rf .next node_modules && npm install
```

---

## Contact & Notes

**Project Location**: `/home/zowlex/hifdhi/quran-memorization-app`

**Current Audio**: Only surahs 1-3 (Al-Fatiha, Al-Baqarah, Al-Imran)
**Missing Audio**: Surahs 4-114 (download with script above)

**Git Status**: Project has git initialized but no commits yet
- Consider creating initial commit before making changes
- Add `.gitignore` for `node_modules`, `.next`, etc.

---

**Last Updated**: 2025-10-06
**Status**: Phase 1 Complete - Ready for enhancements
**Next Session Goal**: Download remaining audio OR add search by ayah text
