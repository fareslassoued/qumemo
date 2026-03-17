import { MemorizationPlan, MemorizationProgress, StudySession, HifzRitual } from '@/types/memorization';

/**
 * Service for managing memorization plans and progress.
 * Works with the bilquran method types (no SM-2).
 */

class MemorizationPlanService {
  private readonly PLANS_KEY = 'memorization_plans';
  private readonly PROGRESS_KEY = 'memorization_progress';
  private readonly SESSIONS_KEY = 'study_sessions';

  private isLocalStorageAvailable(): boolean {
    try {
      return typeof window !== 'undefined' && window.localStorage !== null;
    } catch {
      return false;
    }
  }

  // === PLANS ===

  createPlan(planData: Omit<MemorizationPlan, 'id' | 'createdAt' | 'updatedAt' | 'currentStreak' | 'longestStreak' | 'completionPercentage'>): MemorizationPlan {
    const plan: MemorizationPlan = {
      ...planData,
      id: `plan-${Date.now()}`,
      currentStreak: 0,
      longestStreak: 0,
      completionPercentage: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const plans = this.getAllPlans();
    plans.push(plan);
    this.savePlans(plans);
    return plan;
  }

  getAllPlans(): MemorizationPlan[] {
    if (!this.isLocalStorageAvailable()) return [];
    const data = localStorage.getItem(this.PLANS_KEY);
    if (!data) return [];
    return JSON.parse(data) as MemorizationPlan[];
  }

  getActivePlan(): MemorizationPlan | null {
    return this.getAllPlans().find(p => p.active) || null;
  }

  getPlan(planId: string): MemorizationPlan | null {
    return this.getAllPlans().find(p => p.id === planId) || null;
  }

  updatePlan(planId: string, updates: Partial<MemorizationPlan>): void {
    const plans = this.getAllPlans();
    const index = plans.findIndex(p => p.id === planId);
    if (index >= 0) {
      plans[index] = { ...plans[index], ...updates, updatedAt: new Date().toISOString() };
      this.savePlans(plans);
    }
  }

  pausePlan(planId: string): void {
    this.updatePlan(planId, { pausedAt: new Date().toISOString() });
  }

  resumePlan(planId: string): void {
    this.updatePlan(planId, { pausedAt: undefined });
  }

  deletePlan(planId: string): void {
    const plans = this.getAllPlans().filter(p => p.id !== planId);
    this.savePlans(plans);
    this.deleteAllProgress(planId);
    this.deleteAllSessions(planId);
  }

  resetProgress(planId: string): void {
    this.deleteAllProgress(planId);
    this.deleteAllSessions(planId);
    this.updatePlan(planId, {
      currentStreak: 0,
      longestStreak: 0,
      completionPercentage: 0,
    });
  }

  private savePlans(plans: MemorizationPlan[]): void {
    if (!this.isLocalStorageAvailable()) return;
    localStorage.setItem(this.PLANS_KEY, JSON.stringify(plans));
  }

  // === PROGRESS ===

  getAllProgress(planId: string): MemorizationProgress[] {
    if (!this.isLocalStorageAvailable()) return [];
    const key = `${this.PROGRESS_KEY}_${planId}`;
    const data = localStorage.getItem(key);
    if (!data) return [];
    return JSON.parse(data) as MemorizationProgress[];
  }

  getProgress(planId: string, pageNumber: number): MemorizationProgress | null {
    return this.getAllProgress(planId).find(p => p.pageNumber === pageNumber) || null;
  }

  initializePageProgress(planId: string, pageNumber: number): MemorizationProgress {
    const progress: MemorizationProgress = {
      pageNumber,
      status: 'new',
      ritual: {
        listenCount: 0,
        readCount: 0,
        reciteCount: 0,
        surahLinkDone: false,
      },
      timesReviewed: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const allProgress = this.getAllProgress(planId);
    allProgress.push(progress);
    this.saveAllProgress(planId, allProgress);
    return progress;
  }

  updateProgress(planId: string, pageNumber: number, updates: Partial<MemorizationProgress>): void {
    const allProgress = this.getAllProgress(planId);
    const index = allProgress.findIndex(p => p.pageNumber === pageNumber);
    if (index >= 0) {
      allProgress[index] = {
        ...allProgress[index],
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      this.saveAllProgress(planId, allProgress);
    }
  }

  /**
   * Mark pages as already memorized (delegates to bilQuranService for full setup).
   * This is a thin wrapper that creates progress entries with memorized status.
   */
  markPagesAsMemorized(planId: string, pageNumbers: number[]): void {
    const completedRitual: HifzRitual = {
      listenCount: 2,
      readCount: 15,
      reciteCount: 3,
      surahLinkDone: true,
    };

    for (const page of pageNumbers) {
      let progress = this.getProgress(planId, page);
      if (!progress) {
        progress = this.initializePageProgress(planId, page);
      }
      this.updateProgress(planId, page, {
        status: 'memorized',
        ritual: completedRitual,
      });
    }
  }

  private deleteAllProgress(planId: string): void {
    if (!this.isLocalStorageAvailable()) return;
    localStorage.removeItem(`${this.PROGRESS_KEY}_${planId}`);
  }

  private saveAllProgress(planId: string, progress: MemorizationProgress[]): void {
    if (!this.isLocalStorageAvailable()) return;
    localStorage.setItem(`${this.PROGRESS_KEY}_${planId}`, JSON.stringify(progress));
  }

  // === SESSIONS ===

  getAllSessions(planId: string): StudySession[] {
    if (!this.isLocalStorageAvailable()) return [];
    const key = `${this.SESSIONS_KEY}_${planId}`;
    const data = localStorage.getItem(key);
    if (!data) return [];
    return JSON.parse(data) as StudySession[];
  }

  getTodaySession(planId: string): StudySession | null {
    const sessions = this.getAllSessions(planId);
    const today = new Date().toDateString();
    return sessions.find(s => new Date(s.date).toDateString() === today) || null;
  }

  createSession(session: StudySession): StudySession {
    const sessions = this.getAllSessions(session.planId);
    sessions.push(session);
    this.saveSessions(session.planId, sessions);
    return session;
  }

  updateSession(planId: string, sessionId: string, updates: Partial<StudySession>): void {
    const sessions = this.getAllSessions(planId);
    const index = sessions.findIndex(s => s.id === sessionId);
    if (index >= 0) {
      sessions[index] = { ...sessions[index], ...updates };
      this.saveSessions(planId, sessions);
    }
  }

  completeSession(planId: string, sessionId: string, duration: number): void {
    this.updateSession(planId, sessionId, {
      completed: true,
      completedAt: new Date().toISOString(),
      duration,
    });
    this.updatePlanStatistics(planId);
  }

  private deleteAllSessions(planId: string): void {
    if (!this.isLocalStorageAvailable()) return;
    localStorage.removeItem(`${this.SESSIONS_KEY}_${planId}`);
  }

  private saveSessions(planId: string, sessions: StudySession[]): void {
    if (!this.isLocalStorageAvailable()) return;
    localStorage.setItem(`${this.SESSIONS_KEY}_${planId}`, JSON.stringify(sessions));
  }

  // === STATISTICS ===

  private updatePlanStatistics(planId: string): void {
    const allProgress = this.getAllProgress(planId);
    const memorizedPages = allProgress.filter(p => p.status === 'memorized').length;
    const completionPercentage = (memorizedPages / 604) * 100;

    this.updatePlan(planId, { completionPercentage });
  }
}

export const memorizationPlanService = new MemorizationPlanService();
