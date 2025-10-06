# Quran Memorization App - Qalun Recitation

A modern web application for Quran memorization with Qalun recitation by Mahmoud Khalil Al-Husari. Built with Next.js, TypeScript, and Tailwind CSS.

## Features

### ✨ Core Features

- **📖 Complete Quran Text**: All 604 pages in Qalun recitation with authentic KFGQPC Uthmanic font
- **🎧 Audio Recitation**: Complete Qalun recitation by Mahmoud Khalil Al-Husari
- **📄 Mushaf Layout**: Page-by-page display matching physical Quran layout (15 lines per page)
- **🔍 Easy Navigation**: Browse by Surah, Page, or Juz with quick search
- **🔖 Bookmarks**: Save your favorite pages for quick access
- **🎤 Memorization Mode**: Hide ayahs and test your memorization

### 🎵 Audio Features

- Play/pause controls
- Volume adjustment
- Playback speed control (0.5x - 1.5x)
- Ayah-by-ayah repeat
- Section repeat for specific ranges
- Progress bar with seek functionality

### 📚 Navigation

- **By Surah**: Browse all 114 surahs with ayah counts
- **By Page**: Direct page access (1-604)
- **By Bookmarks**: Quick access to saved pages
- **Search**: Find surahs by Arabic or English name

### 💾 Offline Support

- Local storage for bookmarks and preferences
- IndexedDB for voice recordings
- Cached Quran data for offline access

## Technology Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Font**: KFGQPC Qalun Uthmanic Script
- **Data**: KFGQPC Quran Data (JSON)
- **Audio**: Archive.org (Al-Husari Qalun MP3s)

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Modern web browser with audio support

### Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Download additional audio files** (optional):

   Currently, only the first 3 surahs are included. To download all 114 surahs:

   ```bash
   cd public/audio

   # Download all surahs (596 MB total)
   for i in {1..114}; do
     curl -L -o $(printf "%03d.mp3" $i) \
       https://archive.org/download/husari_qalun/$(printf "%03d.mp3" $i)
   done
   ```

   Or download the complete ZIP:
   ```bash
   wget -O husari_qalun.zip "https://archive.org/compress/husari_qalun/formats=VBR%20MP3"
   unzip husari_qalun.zip -d public/audio/
   ```

3. **Run the development server**:
   ```bash
   npm run dev
   ```

4. **Open your browser**:
   Navigate to [http://localhost:3000](http://localhost:3000)

## Project Structure

```
quran-memorization-app/
├── src/
│   ├── app/
│   │   ├── fonts.ts           # Font configuration
│   │   ├── globals.css        # Global styles
│   │   ├── layout.tsx         # Root layout
│   │   └── page.tsx           # Main page
│   ├── components/
│   │   ├── QuranPageViewer.tsx    # Page display component
│   │   ├── AudioPlayer.tsx        # Audio playback controls
│   │   └── NavigationSidebar.tsx  # Navigation menu
│   ├── services/
│   │   ├── quranDataService.ts    # Quran text data management
│   │   ├── audioService.ts        # Audio playback logic
│   │   ├── recordingService.ts    # Voice recording for memorization
│   │   └── storageService.ts      # Local storage & IndexedDB
│   ├── types/
│   │   └── quran.ts          # TypeScript type definitions
│   └── data/
│       ├── quran/
│       │   └── QaloonData_v10.json    # Complete Quran text
│       └── layout/
│           └── quran-info.json        # Metadata
├── public/
│   ├── audio/                # MP3 files (001.mp3 - 114.mp3)
│   └── fonts/                # Qalun fonts (TTF, WOFF2)
└── package.json
```

## Usage Guide

### Basic Navigation

1. **Open the app** and you'll see Page 1 (Al-Fatiha)
2. **Navigate pages** using Previous/Next buttons
3. **Open menu** to browse by Surah, Page, or Bookmarks

### Audio Playback

1. **Click Play** to start recitation of current surah
2. **Adjust volume** using the slider
3. **Change speed** by opening Settings and selecting 0.5x - 1.5x
4. **Seek** by dragging the progress bar

### Bookmarking

1. Click the **☆ Bookmark** button to save current page
2. Access saved bookmarks from the **Navigation Menu → Bookmarks tab**
3. Click **★ Bookmark** again to remove bookmark

### Memorization Mode

1. Click **📖 Reading Mode** to switch to **🎤 Memorization Mode**
2. Ayahs will be hidden for self-testing
3. Click on hidden text to reveal specific ayahs
4. (Future: Record your recitation and compare)

## Data Sources

### Quran Text (Qalun)
- **Source**: [KFGQPC GitHub Repository](https://github.com/thetruetruth/quran-data-kfgqpc)
- **Format**: JSON (QaloonData_v10.json)
- **License**: Open source
- **Features**: Complete Quran with page/line metadata

### Audio (Al-Husari Qalun)
- **Source**: [Archive.org - husari_qalun](https://archive.org/details/husari_qalun)
- **Reciter**: Mahmoud Khalil Al-Husari
- **Riwayah**: Qalun
- **Format**: VBR MP3 (114 files, one per surah)
- **Size**: 596 MB total

### Font
- **Source**: KFGQPC Quran Printing Complex
- **Font**: Qalun v10 (qaloon.10.woff2, qaloon.10.ttf)
- **Script**: Uthmanic Arabic Script

### Metadata
- **Source**: [fawazahmed0/quran-api](https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@1/)
- **Data**: Juz, Hizb, Surah info, Page mappings

## Development

### Available Scripts

```bash
# Development server
npm run dev

# Production build
npm run build

# Start production server
npm start

# Lint code
npm run lint
```

### Adding New Features

The codebase is structured for easy extension:

- **Services**: Add new services in `src/services/`
- **Components**: Add UI components in `src/components/`
- **Types**: Extend types in `src/types/quran.ts`
- **Styles**: Modify `src/app/globals.css` for global styles

## Future Enhancements

Planned features for future releases:

- [ ] Voice recording and playback comparison
- [ ] Tajweed highlighting
- [ ] Translation display (multiple languages)
- [ ] Tafsir (commentary) integration
- [ ] Progress tracking and statistics
- [ ] Word-by-word display
- [ ] Offline PWA support
- [ ] Mobile app (React Native)

## License

This project uses open-source Quran data and audio:

- **Quran Text**: KFGQPC data (open source)
- **Audio**: Archive.org (free distribution)
- **Fonts**: KFGQPC fonts (free for personal use)

The app code itself is provided as-is for educational purposes.

## Acknowledgments

- **King Fahd Glorious Quran Printing Complex (KFGQPC)** for the authentic Qalun text and fonts
- **Mahmoud Khalil Al-Husari** for the beautiful Qalun recitation
- **Archive.org** for hosting the audio files
- **thetruetruth** for the structured Quran data repository
- **fawazahmed0** for the Quran metadata API

---

**May Allah accept this effort and make it a means of benefit for those seeking to memorize His Book. Ameen.** 🤲
