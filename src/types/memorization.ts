/**
 * Types for "بالقرآن نحيا" Structured Memorization Method
 *
 * Replaces SM-2 spaced repetition with a proven ritual-based approach:
 * Listen 2x → Read 15x → Recite 3x error-free, with rotating chunk review.
 */

// Ritual step tracking for new material
export interface HifzRitual {
  listenCount: number;       // target: 2
  readCount: number;         // target: 15
  reciteCount: number;       // target: 3 (error-free only)
  surahLinkDone: boolean;    // 3rd recitation from surah start
}

// Per-page memorization progress
export interface MemorizationProgress {
  pageNumber: number;
  status: 'new' | 'in-ritual' | 'memorized';
  ritual: HifzRitual;
  lastReviewDate?: string;   // ISO string for JSON serialization
  timesReviewed: number;
  createdAt: string;
  updatedAt: string;
}

// Review rotation chunk
export interface ReviewChunk {
  id: string;
  surahNumber: number;
  startAyah: number;
  endAyah: number;
  pages: number[];
  memorizedAt: string;       // ISO string
}

// Rotation state
export interface ReviewRotation {
  planId: string;
  chunks: ReviewChunk[];
  currentIndex: number;
  lastReviewDate?: string;   // ISO string
}

// Daily study session
export interface StudySession {
  id: string;
  planId: string;
  date: string;              // ISO string
  newMaterial?: {
    pageNumber: number;
    ritual: HifzRitual;
    completed: boolean;
  };
  reviewChunk?: {
    chunkId: string;
    completed: boolean;
  };
  duration: number;          // minutes
  completed: boolean;
  createdAt: string;
  completedAt?: string;
}

// Memorization plan
export interface MemorizationPlan {
  id: string;
  name: string;
  active: boolean;
  dailyGoal: { type: 'half-page' };  // fixed to half-page
  direction: 'forward' | 'backward';
  startPage: number;
  endPage: number;
  currentPage: number;
  studyTime?: 'morning' | 'afternoon' | 'evening' | 'night' | 'flexible';
  reminderEnabled: boolean;
  startDate: string;         // ISO string
  pausedAt?: string;
  currentStreak: number;
  longestStreak: number;
  completionPercentage: number;
  createdAt: string;
  updatedAt: string;
}

// Statistics for dashboard
export interface MemorizationStats {
  totalPages: number;
  memorizedPages: number;
  inRitualPages: number;
  newPages: number;
  rotationCycleLength: number;  // days to review everything
  totalStudyTime: number;
  currentStreak: number;
  longestStreak: number;
  projectedCompletionDate?: Date;
}
