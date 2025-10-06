import { MemorizationPlan, MemorizationProgress, StudySession, MemorizationStats } from '@/types/memorization';
import { spacedRepetitionService } from './spacedRepetitionService';

/**
 * Service for managing memorization plans and progress
 */

class MemorizationPlanService {
  private readonly PLANS_KEY = 'memorization_plans';
  private readonly PROGRESS_KEY = 'memorization_progress';
  private readonly SESSIONS_KEY = 'study_sessions';
  private readonly TOTAL_PAGES = 604;

  /**
   * Check if localStorage is available
   */
  private isLocalStorageAvailable(): boolean {
    try {
      return typeof window !== 'undefined' && window.localStorage !== null;
    } catch {
      return false;
    }
  }

  // === PLANS ===

  /**
   * Create a new memorization plan
   */
  createPlan(planData: Omit<MemorizationPlan, 'id' | 'createdAt' | 'updatedAt' | 'totalDaysActive' | 'currentStreak' | 'longestStreak' | 'completionPercentage'>): MemorizationPlan {
    const plan: MemorizationPlan = {
      ...planData,
      id: `plan-${Date.now()}`,
      totalDaysActive: 0,
      currentStreak: 0,
      longestStreak: 0,
      completionPercentage: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const plans = this.getAllPlans();
    plans.push(plan);
    this.savePlans(plans);

    return plan;
  }

  /**
   * Get all plans
   */
  getAllPlans(): MemorizationPlan[] {
    if (!this.isLocalStorageAvailable()) return [];

    const data = localStorage.getItem(this.PLANS_KEY);
    if (!data) return [];

    return JSON.parse(data).map((p: MemorizationPlan & { createdAt: string; updatedAt: string; startDate: string; pausedAt?: string; targetCompletionDate?: string }) => ({
      ...p,
      createdAt: new Date(p.createdAt),
      updatedAt: new Date(p.updatedAt),
      startDate: new Date(p.startDate),
      pausedAt: p.pausedAt ? new Date(p.pausedAt) : undefined,
      targetCompletionDate: p.targetCompletionDate ? new Date(p.targetCompletionDate) : undefined,
    }));
  }

  /**
   * Get active plan
   */
  getActivePlan(): MemorizationPlan | null {
    const plans = this.getAllPlans();
    return plans.find(p => p.active) || null;
  }

  /**
   * Get plan by ID
   */
  getPlan(planId: string): MemorizationPlan | null {
    const plans = this.getAllPlans();
    return plans.find(p => p.id === planId) || null;
  }

  /**
   * Update a plan
   */
  updatePlan(planId: string, updates: Partial<MemorizationPlan>): void {
    const plans = this.getAllPlans();
    const index = plans.findIndex(p => p.id === planId);

    if (index >= 0) {
      plans[index] = {
        ...plans[index],
        ...updates,
        updatedAt: new Date(),
      };
      this.savePlans(plans);
    }
  }

  /**
   * Pause a plan
   */
  pausePlan(planId: string): void {
    this.updatePlan(planId, { pausedAt: new Date() });
  }

  /**
   * Resume a paused plan
   */
  resumePlan(planId: string): void {
    const plan = this.getPlan(planId);
    if (!plan || !plan.pausedAt) return;

    // Calculate days paused
    const daysPaused = Math.floor(
      (new Date().getTime() - plan.pausedAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Adjust all review dates by days paused
    const allProgress = this.getAllProgress(planId);
    allProgress.forEach(progress => {
      const newDate = new Date(progress.nextReviewDate);
      newDate.setDate(newDate.getDate() + daysPaused);
      this.updateProgress(planId, progress.pageNumber, {
        nextReviewDate: newDate,
      });
    });

    this.updatePlan(planId, { pausedAt: undefined });
  }

  /**
   * Delete a plan
   */
  deletePlan(planId: string): void {
    const plans = this.getAllPlans().filter(p => p.id !== planId);
    this.savePlans(plans);

    // Also delete associated progress and sessions
    this.deleteAllProgress(planId);
    this.deleteAllSessions(planId);
  }

  private savePlans(plans: MemorizationPlan[]): void {
    if (!this.isLocalStorageAvailable()) return;
    localStorage.setItem(this.PLANS_KEY, JSON.stringify(plans));
  }

  // === PROGRESS ===

  /**
   * Get all progress for a plan
   */
  getAllProgress(planId: string): MemorizationProgress[] {
    if (!this.isLocalStorageAvailable()) return [];

    const key = `${this.PROGRESS_KEY}_${planId}`;
    const data = localStorage.getItem(key);
    if (!data) return [];

    return JSON.parse(data).map((p: MemorizationProgress & { nextReviewDate: string; lastReviewDate?: string; createdAt: string; updatedAt: string }) => ({
      ...p,
      nextReviewDate: new Date(p.nextReviewDate),
      lastReviewDate: p.lastReviewDate ? new Date(p.lastReviewDate) : undefined,
      createdAt: new Date(p.createdAt),
      updatedAt: new Date(p.updatedAt),
    }));
  }

  /**
   * Get progress for a specific page
   */
  getProgress(planId: string, pageNumber: number): MemorizationProgress | null {
    const allProgress = this.getAllProgress(planId);
    return allProgress.find(p => p.pageNumber === pageNumber) || null;
  }

  /**
   * Initialize progress for a page
   */
  initializePageProgress(planId: string, pageNumber: number): MemorizationProgress {
    const progress = spacedRepetitionService.initializeProgress(pageNumber);
    const allProgress = this.getAllProgress(planId);
    allProgress.push(progress);
    this.saveAllProgress(planId, allProgress);
    return progress;
  }

  /**
   * Update progress for a page
   */
  updateProgress(
    planId: string,
    pageNumber: number,
    updates: Partial<MemorizationProgress>
  ): void {
    const allProgress = this.getAllProgress(planId);
    const index = allProgress.findIndex(p => p.pageNumber === pageNumber);

    if (index >= 0) {
      allProgress[index] = {
        ...allProgress[index],
        ...updates,
        updatedAt: new Date(),
      };
      this.saveAllProgress(planId, allProgress);
    }
  }

  /**
   * Mark pages as already memorized (for initial setup)
   */
  markPagesAsMastered(planId: string, pageNumbers: number[]): void {
    pageNumbers.forEach(pageNumber => {
      let progress = this.getProgress(planId, pageNumber);
      if (!progress) {
        progress = this.initializePageProgress(planId, pageNumber);
      }

      // Set as mastered with long interval
      this.updateProgress(planId, pageNumber, {
        status: 'mastered',
        easinessFactor: 2.5,
        interval: 30,
        repetitions: 3,
        nextReviewDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
    });
  }

  /**
   * Delete all progress for a plan
   */
  private deleteAllProgress(planId: string): void {
    if (!this.isLocalStorageAvailable()) return;
    const key = `${this.PROGRESS_KEY}_${planId}`;
    localStorage.removeItem(key);
  }

  private saveAllProgress(planId: string, progress: MemorizationProgress[]): void {
    if (!this.isLocalStorageAvailable()) return;
    const key = `${this.PROGRESS_KEY}_${planId}`;
    localStorage.setItem(key, JSON.stringify(progress));
  }

  // === SESSIONS ===

  /**
   * Get all sessions for a plan
   */
  getAllSessions(planId: string): StudySession[] {
    if (!this.isLocalStorageAvailable()) return [];

    const key = `${this.SESSIONS_KEY}_${planId}`;
    const data = localStorage.getItem(key);
    if (!data) return [];

    return JSON.parse(data).map((s: StudySession & { date: string; createdAt: string; completedAt?: string }) => ({
      ...s,
      date: new Date(s.date),
      createdAt: new Date(s.createdAt),
      completedAt: s.completedAt ? new Date(s.completedAt) : undefined,
    }));
  }

  /**
   * Get today's session
   */
  getTodaySession(planId: string): StudySession | null {
    const sessions = this.getAllSessions(planId);
    const today = new Date().toDateString();
    return sessions.find(s => s.date.toDateString() === today) || null;
  }

  /**
   * Create a new session
   */
  createSession(planId: string, reviewQueue: number[], newMaterial: number[]): StudySession {
    const session: StudySession = {
      id: `session-${Date.now()}`,
      planId,
      date: new Date(),
      reviewQueue,
      newMaterial,
      completedReviews: {},
      completedNew: [],
      duration: 0,
      completed: false,
      skipped: false,
      createdAt: new Date(),
    };

    const sessions = this.getAllSessions(planId);
    sessions.push(session);
    this.saveSessions(planId, sessions);

    return session;
  }

  /**
   * Update a session
   */
  updateSession(planId: string, sessionId: string, updates: Partial<StudySession>): void {
    const sessions = this.getAllSessions(planId);
    const index = sessions.findIndex(s => s.id === sessionId);

    if (index >= 0) {
      sessions[index] = {
        ...sessions[index],
        ...updates,
      };
      this.saveSessions(planId, sessions);
    }
  }

  /**
   * Complete a session
   */
  completeSession(planId: string, sessionId: string, duration: number): void {
    this.updateSession(planId, sessionId, {
      completed: true,
      completedAt: new Date(),
      duration,
    });

    // Update plan statistics
    this.updatePlanStatistics(planId);
  }

  /**
   * Delete all sessions for a plan
   */
  private deleteAllSessions(planId: string): void {
    if (!this.isLocalStorageAvailable()) return;
    const key = `${this.SESSIONS_KEY}_${planId}`;
    localStorage.removeItem(key);
  }

  private saveSessions(planId: string, sessions: StudySession[]): void {
    if (!this.isLocalStorageAvailable()) return;
    const key = `${this.SESSIONS_KEY}_${planId}`;
    localStorage.setItem(key, JSON.stringify(sessions));
  }

  // === STATISTICS ===

  /**
   * Get statistics for a plan
   */
  getStatistics(planId: string): MemorizationStats {
    const allProgress = this.getAllProgress(planId);
    const sessions = this.getAllSessions(planId);

    const stats: MemorizationStats = {
      totalPages: this.TOTAL_PAGES,
      newPages: allProgress.filter(p => p.status === 'new').length,
      learningPages: allProgress.filter(p => p.status === 'learning').length,
      reviewPages: allProgress.filter(p => p.status === 'review').length,
      masteredPages: allProgress.filter(p => p.status === 'mastered').length,
      averageRetentionRate: this.calculateRetentionRate(allProgress),
      totalStudyTime: sessions.reduce((sum, s) => sum + s.duration, 0),
      averageSessionDuration: sessions.length > 0
        ? sessions.reduce((sum, s) => sum + s.duration, 0) / sessions.length
        : 0,
      currentStreak: this.calculateCurrentStreak(planId),
      longestStreak: this.calculateLongestStreak(planId),
      projectedCompletionDate: undefined, // Will be calculated below
    };

    // Calculate projection after we have stats
    stats.projectedCompletionDate = this.calculateProjectedCompletion(planId, stats.masteredPages);

    return stats;
  }

  /**
   * Calculate retention rate (percentage of successful reviews)
   */
  private calculateRetentionRate(progress: MemorizationProgress[]): number {
    const totalReviews = progress.reduce((sum, p) => sum + p.totalReviews, 0);
    const successfulReviews = progress.reduce((sum, p) => sum + p.successfulReviews, 0);

    return totalReviews > 0 ? (successfulReviews / totalReviews) * 100 : 100;
  }

  /**
   * Calculate current streak (consecutive days with completed sessions)
   */
  private calculateCurrentStreak(planId: string): number {
    const sessions = this.getAllSessions(planId)
      .filter(s => s.completed)
      .sort((a, b) => b.date.getTime() - a.date.getTime());

    if (sessions.length === 0) return 0;

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < sessions.length; i++) {
      const sessionDate = new Date(sessions[i].date);
      sessionDate.setHours(0, 0, 0, 0);

      const expectedDate = new Date(today);
      expectedDate.setDate(expectedDate.getDate() - i);

      if (sessionDate.getTime() === expectedDate.getTime()) {
        streak++;
      } else {
        break;
      }
    }

    return streak;
  }

  /**
   * Calculate longest streak
   */
  private calculateLongestStreak(planId: string): number {
    const sessions = this.getAllSessions(planId)
      .filter(s => s.completed)
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    if (sessions.length === 0) return 0;

    let longestStreak = 1;
    let currentStreak = 1;

    for (let i = 1; i < sessions.length; i++) {
      const prevDate = new Date(sessions[i - 1].date);
      const currDate = new Date(sessions[i].date);

      prevDate.setHours(0, 0, 0, 0);
      currDate.setHours(0, 0, 0, 0);

      const diffDays = Math.floor(
        (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (diffDays === 1) {
        currentStreak++;
        longestStreak = Math.max(longestStreak, currentStreak);
      } else {
        currentStreak = 1;
      }
    }

    return longestStreak;
  }

  /**
   * Calculate projected completion date
   */
  private calculateProjectedCompletion(planId: string, masteredPages: number): Date | undefined {
    const plan = this.getPlan(planId);
    if (!plan) return undefined;

    const pagesRemaining = this.TOTAL_PAGES - masteredPages;

    // Calculate pages per day based on daily goal
    let pagesPerDay: number;
    switch (plan.dailyGoal.type) {
      case 'full-page':
        pagesPerDay = 1;
        break;
      case 'half-page':
        pagesPerDay = 0.5;
        break;
      case 'quarter-page':
        pagesPerDay = 0.25;
        break;
      case 'custom-lines':
        pagesPerDay = (plan.dailyGoal.linesPerDay || 7.5) / 15; // 15 lines per page
        break;
    }

    const daysRemaining = Math.ceil(pagesRemaining / pagesPerDay);
    const projectedDate = new Date();
    projectedDate.setDate(projectedDate.getDate() + daysRemaining);

    return projectedDate;
  }

  /**
   * Update plan statistics
   */
  private updatePlanStatistics(planId: string): void {
    const stats = this.getStatistics(planId);
    const plan = this.getPlan(planId);

    if (plan) {
      this.updatePlan(planId, {
        currentStreak: stats.currentStreak,
        longestStreak: stats.longestStreak,
        completionPercentage: (stats.masteredPages / this.TOTAL_PAGES) * 100,
        totalDaysActive: this.getAllSessions(planId).filter(s => s.completed).length,
      });
    }
  }
}

// Export singleton instance
export const memorizationPlanService = new MemorizationPlanService();
