import { MemorizationProgress, ReviewResult } from '@/types/memorization';

/**
 * Spaced Repetition Service using SM-2 Algorithm
 *
 * The SM-2 algorithm is a proven spaced repetition system that schedules reviews
 * at optimal intervals based on recall difficulty.
 */

class SpacedRepetitionService {
  /**
   * Calculate next review parameters based on SM-2 algorithm
   *
   * @param quality - Grade from 0-5 (0=blackout, 5=perfect recall)
   * @param currentEF - Current Easiness Factor (1.3-2.5)
   * @param currentInterval - Current interval in days
   * @param currentRepetitions - Number of successful reviews
   * @returns Updated review parameters
   */
  calculateNextReview(
    quality: 0 | 1 | 2 | 3 | 4 | 5,
    currentEF: number,
    currentInterval: number,
    currentRepetitions: number
  ): ReviewResult {
    // Calculate new Easiness Factor
    // Formula: EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    let newEF = currentEF + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

    // EF minimum is 1.3
    if (newEF < 1.3) newEF = 1.3;

    let newReps: number;
    let newInterval: number;
    let status: 'new' | 'learning' | 'review' | 'mastered';

    if (quality < 3) {
      // Failed recall (grades 0, 1, 2) - Reset to beginning
      newReps = 0;
      newInterval = 1;  // Review tomorrow
      status = 'learning';
    } else {
      // Successful recall (grades 3, 4, 5)
      newReps = currentRepetitions + 1;

      if (newReps === 1) {
        newInterval = 1;  // Review after 1 day
        status = 'learning';
      } else if (newReps === 2) {
        newInterval = 6;  // Review after 6 days
        status = 'review';
      } else {
        newInterval = Math.round(currentInterval * newEF);

        // Determine status based on interval
        if (newInterval >= 30) {
          status = 'mastered';  // 30+ day intervals considered mastered
        } else {
          status = 'review';
        }
      }
    }

    // Calculate next review date
    const nextReviewDate = this.addDays(new Date(), newInterval);

    return {
      newEasinessFactor: newEF,
      newInterval,
      newRepetitions: newReps,
      nextReviewDate,
      status,
    };
  }

  /**
   * Initialize a new page for memorization
   */
  initializeProgress(pageNumber: number): MemorizationProgress {
    return {
      pageNumber,
      status: 'new',
      easinessFactor: 2.5,  // SM-2 default starting EF
      interval: 0,
      repetitions: 0,
      nextReviewDate: new Date(), // Due immediately for first review
      totalReviews: 0,
      successfulReviews: 0,
      averageGrade: 0,
      timeSpent: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Update progress after a review
   */
  updateProgress(
    progress: MemorizationProgress,
    grade: 0 | 1 | 2 | 3 | 4 | 5,
    timeSpent: number
  ): MemorizationProgress {
    const result = this.calculateNextReview(
      grade,
      progress.easinessFactor,
      progress.interval,
      progress.repetitions
    );

    // Calculate new average grade
    const totalGradeSum = progress.averageGrade * progress.totalReviews + grade;
    const newAverageGrade = totalGradeSum / (progress.totalReviews + 1);

    return {
      ...progress,
      easinessFactor: result.newEasinessFactor,
      interval: result.newInterval,
      repetitions: result.newRepetitions,
      nextReviewDate: result.nextReviewDate,
      lastReviewDate: new Date(),
      lastGrade: grade,
      status: result.status,
      totalReviews: progress.totalReviews + 1,
      successfulReviews: grade >= 3 ? progress.successfulReviews + 1 : progress.successfulReviews,
      averageGrade: newAverageGrade,
      timeSpent: progress.timeSpent + timeSpent,
      updatedAt: new Date(),
    };
  }

  /**
   * Check if a page is due for review
   */
  isDue(progress: MemorizationProgress, date: Date = new Date()): boolean {
    return progress.nextReviewDate <= date;
  }

  /**
   * Get days until next review (negative if overdue)
   */
  getDaysUntilReview(progress: MemorizationProgress, date: Date = new Date()): number {
    const diffTime = progress.nextReviewDate.getTime() - date.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Get days overdue (0 if not overdue)
   */
  getDaysOverdue(progress: MemorizationProgress, date: Date = new Date()): number {
    const daysUntil = this.getDaysUntilReview(progress, date);
    return daysUntil < 0 ? Math.abs(daysUntil) : 0;
  }

  /**
   * Calculate priority for a review item
   */
  calculatePriority(
    progress: MemorizationProgress,
    date: Date = new Date()
  ): 'critical' | 'high' | 'medium' | 'low' {
    const daysOverdue = this.getDaysOverdue(progress, date);
    const consecutiveFailures = this.getConsecutiveFailures(progress);

    // Critical: Overdue by 3+ days OR 3+ consecutive failures
    if (daysOverdue >= 3 || consecutiveFailures >= 3) {
      return 'critical';
    }

    // High: Overdue by 1-2 days OR 2 consecutive failures
    if (daysOverdue >= 1 || consecutiveFailures >= 2) {
      return 'high';
    }

    // Medium: Due today
    if (this.isDue(progress, date)) {
      return 'medium';
    }

    // Low: Not due yet
    return 'low';
  }

  /**
   * Get consecutive failures count from recent reviews
   */
  private getConsecutiveFailures(progress: MemorizationProgress): number {
    // For now, use a simple heuristic based on last grade
    // In a full implementation, would track review history
    if (!progress.lastGrade || progress.lastGrade >= 3) {
      return 0;
    }

    // If last review was a failure, estimate consecutive failures
    // based on success rate
    const successRate = progress.totalReviews > 0
      ? progress.successfulReviews / progress.totalReviews
      : 1;

    if (successRate < 0.5) return 3;  // Very struggling
    if (successRate < 0.7) return 2;  // Struggling
    return 1;  // Recent failure but generally okay
  }

  /**
   * Helper: Add days to a date
   */
  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  /**
   * Get suggested grade based on user-friendly labels
   */
  gradeFromLabel(label: 'again' | 'hard' | 'good' | 'easy'): 0 | 1 | 2 | 3 | 4 | 5 {
    switch (label) {
      case 'again':
        return 1;  // Failed recall
      case 'hard':
        return 3;  // Recalled with difficulty
      case 'good':
        return 4;  // Recalled with some effort
      case 'easy':
        return 5;  // Perfect recall
    }
  }

  /**
   * Get preview of next intervals for each grade
   */
  getIntervalPreview(progress: MemorizationProgress): Record<string, number> {
    const grades: Array<0 | 1 | 2 | 3 | 4 | 5> = [1, 3, 4, 5];
    const labels = ['again', 'hard', 'good', 'easy'];
    const preview: Record<string, number> = {};

    grades.forEach((grade, index) => {
      const result = this.calculateNextReview(
        grade,
        progress.easinessFactor,
        progress.interval,
        progress.repetitions
      );
      preview[labels[index]] = result.newInterval;
    });

    return preview;
  }
}

// Export singleton instance
export const spacedRepetitionService = new SpacedRepetitionService();
