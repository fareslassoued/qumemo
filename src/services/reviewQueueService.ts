import { ReviewItem, MemorizationPlan } from '@/types/memorization';
import { spacedRepetitionService } from './spacedRepetitionService';
import { memorizationPlanService } from './memorizationPlanService';

/**
 * Service for generating and managing daily review queues
 */

class ReviewQueueService {
  /**
   * Generate today's review queue for a plan
   */
  generateTodayQueue(planId: string, date: Date = new Date()): ReviewItem[] {
    const allProgress = memorizationPlanService.getAllProgress(planId);
    const reviewItems: ReviewItem[] = [];

    // Filter for pages that are due for review
    for (const progress of allProgress) {
      if (progress.status === 'new') continue; // Skip new pages

      if (spacedRepetitionService.isDue(progress, date)) {
        const daysOverdue = spacedRepetitionService.getDaysOverdue(progress, date);
        const priority = spacedRepetitionService.calculatePriority(progress, date);

        reviewItems.push({
          pageNumber: progress.pageNumber,
          section: progress.section,
          daysOverdue,
          lastGrade: progress.lastGrade || 0,
          consecutiveFailures: this.getConsecutiveFailures(progress),
          priority,
        });
      }
    }

    // Sort by priority (critical first) and days overdue
    return reviewItems.sort((a, b) => {
      // First sort by priority
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;

      // Then by days overdue (descending)
      return b.daysOverdue - a.daysOverdue;
    });
  }

  /**
   * Get next page(s) for new material
   */
  getNextNewMaterial(planId: string): number[] {
    const plan = memorizationPlanService.getPlan(planId);
    if (!plan) return [];

    const allProgress = memorizationPlanService.getAllProgress(planId);
    const completedPages = new Set(allProgress.map(p => p.pageNumber));

    // Determine starting page based on direction
    let nextPage: number;
    if (plan.direction === 'forward') {
      // Find first unstarted page from beginning
      nextPage = plan.startPage;
      while (completedPages.has(nextPage) && nextPage <= plan.endPage) {
        nextPage++;
      }
    } else {
      // Find first unstarted page from end (backward)
      nextPage = plan.endPage;
      while (completedPages.has(nextPage) && nextPage >= plan.startPage) {
        nextPage--;
      }
    }

    // Check if we've reached the end
    if ((plan.direction === 'forward' && nextPage > plan.endPage) ||
        (plan.direction === 'backward' && nextPage < plan.startPage)) {
      return []; // Plan complete!
    }

    // For now, return single page
    // In future, could support multi-page new material based on daily goal
    return [nextPage];
  }

  /**
   * Check if there are reviews due today
   */
  hasReviewsDueToday(planId: string, date: Date = new Date()): boolean {
    const queue = this.generateTodayQueue(planId, date);
    return queue.length > 0;
  }

  /**
   * Get count of reviews due today
   */
  getReviewCount(planId: string, date: Date = new Date()): number {
    const queue = this.generateTodayQueue(planId, date);
    return queue.length;
  }

  /**
   * Get count of overdue reviews
   */
  getOverdueCount(planId: string, date: Date = new Date()): number {
    const queue = this.generateTodayQueue(planId, date);
    return queue.filter(item => item.daysOverdue > 0).length;
  }

  /**
   * Get count of critical reviews (high priority)
   */
  getCriticalCount(planId: string, date: Date = new Date()): number {
    const queue = this.generateTodayQueue(planId, date);
    return queue.filter(item => item.priority === 'critical').length;
  }

  /**
   * Get review forecast for next N days
   */
  getForecast(planId: string, days: number = 7): Record<string, number> {
    const forecast: Record<string, number> = {};
    const today = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      const dateKey = date.toISOString().split('T')[0];
      forecast[dateKey] = this.getReviewCount(planId, date);
    }

    return forecast;
  }

  /**
   * Check if new material should be presented today
   * (only after reviews are complete or if no reviews)
   */
  shouldPresentNewMaterial(planId: string): boolean {
    const plan = memorizationPlanService.getPlan(planId);
    if (!plan || plan.pausedAt) return false;

    // Check if there's a session today
    const todaySession = memorizationPlanService.getTodaySession(planId);
    if (todaySession) {
      // If session exists, check if reviews are complete
      return todaySession.reviewQueue.every(
        pageNum => todaySession.completedReviews[pageNum] !== undefined
      );
    }

    // No session yet, check if reviews are done or if none exist
    return !this.hasReviewsDueToday(planId);
  }

  /**
   * Get consecutive failures for priority calculation
   */
  private getConsecutiveFailures(progress: { lastGrade?: number; totalReviews: number; successfulReviews: number }): number {
    if (!progress.lastGrade || progress.lastGrade >= 3) {
      return 0;
    }

    const successRate = progress.totalReviews > 0
      ? progress.successfulReviews / progress.totalReviews
      : 1;

    if (successRate < 0.5) return 3;
    if (successRate < 0.7) return 2;
    return 1;
  }

  /**
   * Get summary of today's study requirements
   */
  getTodaySummary(planId: string): {
    reviewsTotal: number;
    reviewsOverdue: number;
    reviewsCritical: number;
    newMaterial: number[];
    hasSession: boolean;
    nextSessionDate: Date | null;
  } {
    const reviewQueue = this.generateTodayQueue(planId);
    const newMaterial = this.shouldPresentNewMaterial(planId)
      ? this.getNextNewMaterial(planId)
      : [];
    const todaySession = memorizationPlanService.getTodaySession(planId);
    const nextSessionDate = this.getNextSessionDate(planId);

    return {
      reviewsTotal: reviewQueue.length,
      reviewsOverdue: reviewQueue.filter(r => r.daysOverdue > 0).length,
      reviewsCritical: reviewQueue.filter(r => r.priority === 'critical').length,
      newMaterial,
      hasSession: todaySession !== null && !todaySession.completed,
      nextSessionDate,
    };
  }

  /**
   * Get the date when the next review session is due
   */
  getNextSessionDate(planId: string): Date | null {
    const allProgress = memorizationPlanService.getAllProgress(planId);

    if (allProgress.length === 0) {
      // No progress yet, next session is today
      return new Date();
    }

    // Find the earliest due date
    let earliestDate: Date | null = null;

    for (const progress of allProgress) {
      if (progress.status === 'new') continue;

      const dueDate = progress.nextReviewDate;
      if (!earliestDate || dueDate < earliestDate) {
        earliestDate = dueDate;
      }
    }

    // If no reviews scheduled, return today (for new material)
    return earliestDate || new Date();
  }

  /**
   * Create or get today's study session
   */
  getOrCreateTodaySession(planId: string) {
    let session = memorizationPlanService.getTodaySession(planId);

    // Only return session if it's not completed
    if (session && !session.completed) {
      return session;
    }

    // If no session or session is completed, create new one
    const reviewQueue = this.generateTodayQueue(planId);
    const newMaterial = this.getNextNewMaterial(planId);

    session = memorizationPlanService.createSession(
      planId,
      reviewQueue.map(r => r.pageNumber),
      newMaterial
    );

    return session;
  }

  /**
   * Check if plan is complete
   */
  isPlanComplete(planId: string): boolean {
    const plan = memorizationPlanService.getPlan(planId);
    if (!plan) return false;

    const stats = memorizationPlanService.getStatistics(planId);
    const totalPagesInRange = Math.abs(plan.endPage - plan.startPage) + 1;

    return stats.masteredPages >= totalPagesInRange;
  }
}

// Export singleton instance
export const reviewQueueService = new ReviewQueueService();
