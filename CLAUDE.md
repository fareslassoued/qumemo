# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Qumemo is a Quran memorization web app featuring Qalun recitation by Mahmoud Khalil Al-Husari. Built with Next.js 15, TypeScript, React 19, and Tailwind CSS.

## Commands

```bash
npm run dev          # Start dev server with Turbopack (http://localhost:3000)
npm run build        # Production build with Turbopack
npm start            # Start production server
npm run lint         # Run ESLint
npm test             # Run Jest tests
npm run test:watch   # Watch mode for tests
```

## Architecture

### Directory Structure

- `src/app/` - Next.js App Router pages (main reader, memorization hub, review sessions, stats)
- `src/components/` - React components (QuranPageViewer, AudioPlayer, NavigationSidebar, ReviewSession, etc.)
- `src/services/` - Business logic singletons (quranDataService, audioService, memorizationPlanService, reviewQueueService, spacedRepetitionService, storageService)
- `src/types/` - TypeScript interfaces (`quran.ts` for core types, `memorization.ts` for SM-2 algorithm types)
- `src/utils/` - Utility functions (surahDetection, ayahUtils)
- `src/data/quran/` - Quran text JSON (QaloonData_v10.json with 6,236 verses)
- `public/audio/` - MP3 files (001.mp3-114.mp3, downloaded on-demand from Archive.org)
- `public/fonts/` - KFGQPC Qalun fonts

### Key Patterns

**Service Singletons**: Services are instantiated once and exported as singletons:
```typescript
export const audioService = new AudioService();
```

**Event Emitter Pattern**: AudioService uses CustomEvent for state updates. Components listen with `window.addEventListener('audio-state-change', handler)`.

**Client-Side Components**: Components marked with `'use client'`. Services dynamically imported in handlers to avoid SSR issues.

**Storage Strategy**:
- LocalStorage: bookmarks, settings, memorization plans
- IndexedDB: audio recordings
- Cache API: downloaded audio files

**Path Alias**: `@/*` maps to `./src/*`

### Core Data Types

From `src/types/quran.ts`:
- `Ayah` - Individual verse with surah/page/line metadata
- `PageInfo` - 604 pages with ayahs and juz info

From `src/types/memorization.ts`:
- `MemorizationProgress` - SM-2 algorithm tracking (easiness factor, interval, repetitions)
- `MemorizationPlan` - User's study program with daily goals
- `ReviewItem` - Items prioritized for daily review

### Key Services

- `quranDataService` - Load/query Quran text, get pages/surahs/ayahs
- `memorizationPlanService` - Create/manage memorization plans, track progress
- `reviewQueueService` - Generate daily review queue using spaced repetition
- `spacedRepetitionService` - SM-2 algorithm implementation
- `audioService` - Audio playback with volume/speed control and caching
- `audioDownloadService` - Download/cache audio from Archive.org (husari_qalun collection)

## Data Sources

- **Quran Text**: KFGQPC Qalun Uthmanic Script (QaloonData_v10.json)
- **Audio**: Archive.org husari_qalun collection - Mahmoud Khalil Al-Husari
- **Fonts**: KFGQPC Qalun fonts (WOFF2 + TTF)
