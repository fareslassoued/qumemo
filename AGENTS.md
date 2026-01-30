# AGENTS.md

This file provides guidance for agentic coding agents working in the Qumemo repository.

## Project Overview

Qumemo is a Quran memorization web app featuring Qalun recitation by Mahmoud Khalil Al-Husari. Built with Next.js 15, TypeScript, React 19, and Tailwind CSS.

## Commands

### Development
```bash
npm run dev          # Start dev server with Turbopack (http://localhost:3000)
npm run build        # Production build with Turbopack
npm start            # Start production server
```

### Code Quality
```bash
npm run lint         # Run ESLint (uses eslint.config.mjs with Next.js rules)
npm run test         # Run Jest tests
npm run test:watch   # Watch mode for tests
```

### Single Test Execution
```bash
# Run a specific test file
npm test -- path/to/test/file.test.tsx

# Run tests matching a pattern
npm test -- --testNamePattern="test description"

# Run tests with coverage
npm test -- --coverage

# Run specific test file with coverage
npm test -- src/utils/__tests__/surahDetection.test.ts --coverage
```

## Code Style Guidelines

### TypeScript Configuration
- **Target**: ES2017
- **Strict mode**: Enabled
- **Module resolution**: Bundler
- **Path alias**: `@/*` maps to `./src/*`
- **JSX**: Preserve (handled by Next.js)

### Import Conventions
- **Services**: Use singleton instances: `import { quranDataService } from '@/services/quranDataService'`
- **Components**: Use named exports: `import { QuranPageViewer } from '@/components/QuranPageViewer'`
- **Types**: Use absolute imports: `import { Ayah, PageInfo } from '@/types/quran'`
- **Utils**: Use absolute imports: `import { extractAyahNumber } from '@/utils/ayahUtils'`
- **Dynamic imports**: Use for client-side only code to avoid SSR issues

### Component Patterns
- **Client components**: Mark with `'use client'` at the top
- **Props**: Define interfaces with clear naming (e.g., `QuranPageViewerProps`)
- **State management**: Use React hooks (`useState`, `useEffect`) locally
- **Event handlers**: Use descriptive names (e.g., `handlePreviousPage`, `onAyahClick`)
- **Default exports**: Use for Next.js pages (e.g., `export default function Home()`)
- **CSS classes**: Use Tailwind utility classes with responsive prefixes (`sm:`, `md:`, `lg:`)

### Service Architecture
- **Singleton pattern**: Services are instantiated once and exported as singletons
- **Event emitters**: Use CustomEvent for state updates (e.g., `window.addEventListener('audio-state-change', handler)`)
- **Client-side only**: Services dynamically imported in handlers to avoid SSR issues
- **Class-based services**: Use private methods and properties for encapsulation

### Naming Conventions
- **Files**: PascalCase for components, camelCase for services/utils, snake_case for types
- **Variables/Functions**: camelCase
- **Types/Interfaces**: PascalCase (e.g., `Ayah`, `PageInfo`, `MemorizationPlan`)
- **Constants**: UPPER_SNAKE_CASE
- **Props**: camelCase with descriptive names
- **Private methods**: Prefix with underscore or use `private` keyword

### Error Handling
- **Null checks**: Always check for null/undefined before using optional values
- **Type safety**: Use TypeScript's nullish coalescing (`??`) and optional chaining (`?.`)
- **Graceful fallbacks**: Provide fallback UI for loading/error states
- **User feedback**: Show appropriate error messages for user actions
- **Return types**: Use union types for functions that may return null (e.g., `PageInfo | null`)

### Data Patterns
- **Quran data**: Load from `@/data/quran/QaloonData_v10.json`
- **Storage strategy**:
  - LocalStorage: bookmarks, settings, memorization plans
  - IndexedDB: audio recordings
  - Cache API: downloaded audio files
- **Data services**: Use `quranDataService` for all Quran text operations

### Type Definitions
- **Core types**: Define in `src/types/quran.ts` and `src/types/memorization.ts`
- **SM-2 algorithm**: Implement spaced repetition logic in `spacedRepetitionService`
- **Audio state**: Use `AudioPlayerState` interface for audio player management
- **Interface naming**: Use descriptive names that indicate purpose

### React Patterns
- **Hooks**: Use functional components with hooks
- **Event handling**: Pass callbacks as props (e.g., `onPageChange`, `onAyahClick`)
- **Conditional rendering**: Use ternary operators or && for conditional UI
- **Lists**: Use `Array.map()` with proper keys (use unique IDs, not array indices)
- **useEffect dependencies**: Include all dependencies to avoid stale closures

### Styling
- **Tailwind CSS**: Use utility-first classes
- **Responsive design**: Include mobile-first breakpoints (e.g., `sm:`, `md:`, `lg:`)
- **Dark mode**: Support both light and dark themes with `dark:` prefix
- **Arabic text**: Use `quran-text` class for proper Quranic text styling
- **Touch targets**: Use `touch-manipulation` for mobile-friendly buttons

### Testing Guidelines
- **Test files**: Place in `__tests__` directories or use `.test.ts`/`.test.tsx` suffix
- **Component tests**: Use Testing Library for user interaction tests
- **Service tests**: Mock external dependencies and test business logic
- **Setup**: Use `jest.setup.js` for global test setup
- **Mocking**: Use `jest.mock()` for service dependencies
- **Test patterns**: Follow Arrange-Act-Assert structure with descriptive test names

### File Organization
- **Services**: `src/services/` - Business logic singletons
- **Components**: `src/components/` - React UI components
- **Types**: `src/types/` - TypeScript interfaces
- **Utils**: `src/utils/` - Utility functions
- **Data**: `src/data/` - Static JSON data
- **Pages**: `src/app/` - Next.js App Router pages

### Performance Considerations
- **Dynamic imports**: Use for client-side only code in Next.js pages
- **Memoization**: Consider React.memo for expensive components
- **Audio caching**: Implement proper caching strategy for audio files
- **Lazy loading**: Consider for large components or data sets
- **State updates**: Batch related state updates when possible

### Security Practices
- **No secrets**: Never commit API keys or sensitive data
- **Input validation**: Validate user inputs before processing
- **XSS prevention**: Use proper escaping for dynamic content
- **HTTPS**: Always use secure connections in production
- **LocalStorage**: Don't store sensitive data in localStorage

### Jest Configuration
- **Test environment**: jsdom for DOM testing
- **Module mapping**: `@/*` resolves to `src/*`
- **Setup files**: `jest.setup.js` runs after test environment setup
- **Test patterns**: `**/__tests__/**/*.[jt]s?(x)` and `**/?(*.)+(spec|test).[jt]s?(x)`

### ESLint Configuration
- **Extends**: `next/core-web-vitals`, `next/typescript`
- **Ignores**: `node_modules`, `.next`, `out`, `build`, `next-env.d.ts`
- **Location**: Config in `eslint.config.mjs`
