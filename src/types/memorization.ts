/**
 * Types for Spaced Repetition Memorization System
 */

// Memorization Progress for each page/section
export interface MemorizationProgress {
  pageNumber: number;
  section?: 'full' | 'first-half' | 'second-half' | 'lines-1-5' | 'lines-6-10' | 'lines-11-15';
  status: 'new' | 'learning' | 'review' | 'mastered';

  // SM-2 Algorithm fields
  easinessFactor: number;      // 1.3-2.5, starts at 2.5
  interval: number;             // days until next review
  repetitions: number;          // successful review count

  // Scheduling
  nextReviewDate: Date;
  lastReviewDate?: Date;
  lastGrade?: 0 | 1 | 2 | 3 | 4 | 5;  // 0=blackout, 5=perfect

  // Statistics
  totalReviews: number;
  successfulReviews: number;
  averageGrade: number;
  timeSpent: number;            // total minutes spent

  createdAt: Date;
  updatedAt: Date;
}

// Memorization Plan (user's study program)
export interface MemorizationPlan {
  id: string;
  name: string;
  active: boolean;

  // Goal Settings
  dailyGoal: {
    type: 'full-page' | 'half-page' | 'quarter-page' | 'custom-lines';
    linesPerDay?: number;       // if custom
  };

  // Direction & Range
  direction: 'forward' | 'backward';  // From beginning or end
  startPage: number;
  endPage: number;              // 604 by default
  currentPage: number;

  // Schedule
  studyTime?: 'morning' | 'afternoon' | 'evening' | 'night' | 'flexible';
  reminderEnabled: boolean;
  reminderTime?: string;        // "08:00"

  // Dates
  startDate: Date;
  targetCompletionDate?: Date;
  pausedAt?: Date;              // for pause/resume

  // Statistics
  totalDaysActive: number;
  currentStreak: number;
  longestStreak: number;
  completionPercentage: number;

  createdAt: Date;
  updatedAt: Date;
}

// Daily Study Session
export interface StudySession {
  id: string;
  planId: string;
  date: Date;

  // Session content
  reviewQueue: number[];        // page numbers to review
  newMaterial: number[];        // new pages to learn

  // Results
  completedReviews: Record<number, {
    grade: 0 | 1 | 2 | 3 | 4 | 5;
    timeSpent: number;
    recordingId?: string;
  }>;
  completedNew: number[];

  // Metrics
  duration: number;             // minutes
  completed: boolean;
  skipped: boolean;

  createdAt: Date;
  completedAt?: Date;
}

// Review Queue Item (for today's reviews)
export interface ReviewItem {
  pageNumber: number;
  section?: string;
  daysOverdue: number;          // 0 if due today, >0 if overdue
  lastGrade: number;
  consecutiveFailures: number;  // prioritize struggling pages
  priority: 'critical' | 'high' | 'medium' | 'low';
}

// SM-2 Review Result
export interface ReviewResult {
  newEasinessFactor: number;
  newInterval: number;
  newRepetitions: number;
  nextReviewDate: Date;
  status: 'new' | 'learning' | 'review' | 'mastered';
}

// Memorization Statistics
export interface MemorizationStats {
  totalPages: number;
  newPages: number;
  learningPages: number;
  reviewPages: number;
  masteredPages: number;
  averageRetentionRate: number;
  totalStudyTime: number;
  averageSessionDuration: number;
  currentStreak: number;
  longestStreak: number;
  projectedCompletionDate?: Date;
}
