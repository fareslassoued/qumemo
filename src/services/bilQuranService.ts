import {
  MemorizationProgress,
  HifzRitual,
  ReviewChunk,
  ReviewRotation,
  MemorizationStats,
} from '@/types/memorization';
import { memorizationPlanService } from './memorizationPlanService';
import { quranDataService } from './quranDataService';

/**
 * Core service for the "بالقرآن نحيا" memorization method.
 *
 * Manages the ritual state machine (Listen → Read → Recite) and
 * the rotating chunk review system.
 */
class BilQuranService {
  private readonly ROTATION_KEY = 'bilquran_rotation';

  private readonly LISTEN_TARGET = 2;
  private readonly READ_TARGET = 15;
  private readonly RECITE_TARGET = 3;

  // Grace period: no review until 3+ pages memorized
  private readonly REVIEW_GRACE_PAGES = 3;

  // Chunk consolidation thresholds
  private readonly RECENT_DAYS = 30;
  private readonly MAX_CONSOLIDATED_PAGES = 5;

  private isLocalStorageAvailable(): boolean {
    try {
      return typeof window !== 'undefined' && window.localStorage !== null;
    } catch {
      return false;
    }
  }

  // === RITUAL STATE MACHINE ===

  private defaultRitual(): HifzRitual {
    return {
      listenCount: 0,
      readCount: 0,
      reciteCount: 0,
      surahLinkDone: false,
    };
  }

  getProgress(planId: string, page: number): MemorizationProgress | null {
    return memorizationPlanService.getProgress(planId, page);
  }

  getAllProgress(planId: string): MemorizationProgress[] {
    return memorizationPlanService.getAllProgress(planId);
  }

  startRitual(planId: string, page: number): MemorizationProgress {
    let progress = this.getProgress(planId, page);
    if (!progress) {
      progress = memorizationPlanService.initializePageProgress(planId, page);
    }

    if (progress.status === 'new') {
      memorizationPlanService.updateProgress(planId, page, {
        status: 'in-ritual',
        ritual: this.defaultRitual(),
      });
    }

    return this.getProgress(planId, page)!;
  }

  advanceListen(planId: string, page: number): HifzRitual {
    const progress = this.getProgress(planId, page);
    if (!progress) return this.defaultRitual();

    const newCount = Math.min(progress.ritual.listenCount + 1, this.LISTEN_TARGET);
    const updatedRitual = { ...progress.ritual, listenCount: newCount };
    memorizationPlanService.updateProgress(planId, page, { ritual: updatedRitual });
    return updatedRitual;
  }

  advanceRead(planId: string, page: number): HifzRitual {
    const progress = this.getProgress(planId, page);
    if (!progress) return this.defaultRitual();

    // Can only advance read after listen is complete
    if (progress.ritual.listenCount < this.LISTEN_TARGET) return progress.ritual;

    const newCount = Math.min(progress.ritual.readCount + 1, this.READ_TARGET);
    const updatedRitual = { ...progress.ritual, readCount: newCount };
    memorizationPlanService.updateProgress(planId, page, { ritual: updatedRitual });
    return updatedRitual;
  }

  advanceRecite(planId: string, page: number, errorFree: boolean): HifzRitual {
    const progress = this.getProgress(planId, page);
    if (!progress) return this.defaultRitual();

    // Can only recite after read is complete
    if (progress.ritual.readCount < this.READ_TARGET) return progress.ritual;

    if (!errorFree) {
      // Mistake — don't increment, stay on current count
      return progress.ritual;
    }

    const newCount = Math.min(progress.ritual.reciteCount + 1, this.RECITE_TARGET);
    const updatedRitual = { ...progress.ritual, reciteCount: newCount };
    memorizationPlanService.updateProgress(planId, page, { ritual: updatedRitual });
    return updatedRitual;
  }

  completeSurahLink(planId: string, page: number): void {
    const progress = this.getProgress(planId, page);
    if (!progress) return;

    if (progress.ritual.reciteCount < this.RECITE_TARGET) return;

    const updatedRitual = { ...progress.ritual, surahLinkDone: true };
    memorizationPlanService.updateProgress(planId, page, {
      ritual: updatedRitual,
      status: 'memorized',
    });

    // Create a review chunk for this page
    this.addPageToRotation(planId, page);
  }

  isListenComplete(ritual: HifzRitual): boolean {
    return ritual.listenCount >= this.LISTEN_TARGET;
  }

  isReadComplete(ritual: HifzRitual): boolean {
    return ritual.readCount >= this.READ_TARGET;
  }

  isReciteComplete(ritual: HifzRitual): boolean {
    return ritual.reciteCount >= this.RECITE_TARGET;
  }

  isRitualComplete(ritual: HifzRitual): boolean {
    return this.isReciteComplete(ritual) && ritual.surahLinkDone;
  }

  /**
   * Determine which ritual phase a page is in
   */
  getCurrentPhase(ritual: HifzRitual): 'listen' | 'read' | 'recite' | 'surah-link' | 'complete' {
    if (!this.isListenComplete(ritual)) return 'listen';
    if (!this.isReadComplete(ritual)) return 'read';
    if (!this.isReciteComplete(ritual)) return 'recite';
    if (!ritual.surahLinkDone) return 'surah-link';
    return 'complete';
  }

  // === REVIEW ROTATION ===

  getRotation(planId: string): ReviewRotation {
    if (!this.isLocalStorageAvailable()) {
      return { planId, chunks: [], currentIndex: 0 };
    }

    const key = `${this.ROTATION_KEY}_${planId}`;
    const data = localStorage.getItem(key);
    if (!data) return { planId, chunks: [], currentIndex: 0 };

    return JSON.parse(data) as ReviewRotation;
  }

  private saveRotation(rotation: ReviewRotation): void {
    if (!this.isLocalStorageAvailable()) return;
    const key = `${this.ROTATION_KEY}_${rotation.planId}`;
    localStorage.setItem(key, JSON.stringify(rotation));
  }

  private addPageToRotation(planId: string, page: number): void {
    const rotation = this.getRotation(planId);
    const pageInfo = quranDataService.getPageInfo(page);
    if (!pageInfo) return;

    // Get the primary surah on this page
    const primarySurah = quranDataService.getPagePrimarySurah(page);
    if (!primarySurah) return;

    // Get ayah range for this page in this surah
    const surahAyahs = pageInfo.ayahs.filter(
      (a: { sura_no: number }) => a.sura_no === primarySurah
    );
    if (surahAyahs.length === 0) return;

    const startAyah = surahAyahs[0].aya_no;
    const endAyah = surahAyahs[surahAyahs.length - 1].aya_no;

    const chunk: ReviewChunk = {
      id: `chunk-${planId}-${page}-${Date.now()}`,
      surahNumber: primarySurah,
      startAyah,
      endAyah,
      pages: [page],
      memorizedAt: new Date().toISOString(),
    };

    rotation.chunks.push(chunk);

    // Consolidate adjacent chunks from the same surah
    this.consolidateChunks(rotation);

    this.saveRotation(rotation);
  }

  /**
   * Consolidate adjacent same-surah chunks.
   * Recent (<30 days): 1 page per chunk.
   * Mature (>=30 days): merge adjacent same-surah chunks up to 5 pages.
   */
  private consolidateChunks(rotation: ReviewRotation): void {
    const now = new Date();
    const chunks = rotation.chunks;

    // Sort by surah then by start ayah
    chunks.sort((a, b) => {
      if (a.surahNumber !== b.surahNumber) return a.surahNumber - b.surahNumber;
      return a.startAyah - b.startAyah;
    });

    const consolidated: ReviewChunk[] = [];
    let i = 0;

    while (i < chunks.length) {
      const chunk = { ...chunks[i] };
      const age = (now.getTime() - new Date(chunk.memorizedAt).getTime()) / (1000 * 60 * 60 * 24);

      if (age < this.RECENT_DAYS) {
        // Recent chunk — keep as-is (1 page per chunk)
        consolidated.push(chunk);
        i++;
        continue;
      }

      // Mature chunk — try to merge with adjacent same-surah chunks
      let j = i + 1;
      while (
        j < chunks.length &&
        chunks[j].surahNumber === chunk.surahNumber &&
        chunk.pages.length < this.MAX_CONSOLIDATED_PAGES
      ) {
        const nextAge = (now.getTime() - new Date(chunks[j].memorizedAt).getTime()) / (1000 * 60 * 60 * 24);
        if (nextAge < this.RECENT_DAYS) break; // Don't merge recent into mature

        // Merge
        chunk.endAyah = chunks[j].endAyah;
        chunk.pages = [...new Set([...chunk.pages, ...chunks[j].pages])].sort((a, b) => a - b);
        j++;
      }

      consolidated.push(chunk);
      i = j;
    }

    rotation.chunks = consolidated;
  }

  /**
   * Get today's review chunk via round-robin.
   * Returns null if grace period not met or no chunks.
   */
  getTodayReviewChunk(planId: string): ReviewChunk | null {
    const rotation = this.getRotation(planId);

    // Grace period check
    const memorizedCount = this.getAllProgress(planId)
      .filter(p => p.status === 'memorized').length;
    if (memorizedCount < this.REVIEW_GRACE_PAGES) return null;

    if (rotation.chunks.length === 0) return null;

    // Re-consolidate (in case time has passed)
    this.consolidateChunks(rotation);
    this.saveRotation(rotation);

    const index = rotation.currentIndex % rotation.chunks.length;
    return rotation.chunks[index];
  }

  completeReview(planId: string, chunkId: string): void {
    const rotation = this.getRotation(planId);
    const chunkIndex = rotation.chunks.findIndex(c => c.id === chunkId);

    if (chunkIndex >= 0) {
      // Advance the round-robin index
      rotation.currentIndex = (rotation.currentIndex + 1) % rotation.chunks.length;
      rotation.lastReviewDate = new Date().toISOString();
      this.saveRotation(rotation);

      // Update review dates for all pages in the chunk
      const chunk = rotation.chunks[chunkIndex];
      for (const page of chunk.pages) {
        const progress = this.getProgress(planId, page);
        if (progress) {
          memorizationPlanService.updateProgress(planId, page, {
            lastReviewDate: new Date().toISOString(),
            timesReviewed: progress.timesReviewed + 1,
          });
        }
      }
    }
  }

  // === STATISTICS ===

  getStatistics(planId: string): MemorizationStats {
    const allProgress = this.getAllProgress(planId);
    const sessions = memorizationPlanService.getAllSessions(planId);
    const rotation = this.getRotation(planId);
    const plan = memorizationPlanService.getPlan(planId);

    const memorizedPages = allProgress.filter(p => p.status === 'memorized').length;
    const inRitualPages = allProgress.filter(p => p.status === 'in-ritual').length;
    const totalPages = 604;

    const streaks = this.calculateStreaks(sessions);

    const stats: MemorizationStats = {
      totalPages,
      memorizedPages,
      inRitualPages,
      newPages: totalPages - memorizedPages - inRitualPages,
      rotationCycleLength: rotation.chunks.length || 0,
      totalStudyTime: sessions.reduce((sum, s) => sum + s.duration, 0),
      currentStreak: streaks.current,
      longestStreak: streaks.longest,
    };

    // Projected completion: half-page/day = 0.5 pages/day
    if (plan) {
      const pagesRemaining = totalPages - memorizedPages;
      const daysRemaining = Math.ceil(pagesRemaining / 0.5);
      const projectedDate = new Date();
      projectedDate.setDate(projectedDate.getDate() + daysRemaining);
      stats.projectedCompletionDate = projectedDate;
    }

    return stats;
  }

  private calculateStreaks(sessions: { date: string; completed: boolean }[]): {
    current: number;
    longest: number;
  } {
    const completedDates = sessions
      .filter(s => s.completed)
      .map(s => {
        const d = new Date(s.date);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
      })
      .filter((v, i, a) => a.indexOf(v) === i) // unique dates
      .sort((a, b) => b - a); // newest first

    if (completedDates.length === 0) return { current: 0, longest: 0 };

    // Current streak
    let current = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < completedDates.length; i++) {
      const expected = new Date(today);
      expected.setDate(expected.getDate() - i);
      if (completedDates[i] === expected.getTime()) {
        current++;
      } else {
        break;
      }
    }

    // Longest streak
    const sorted = [...completedDates].sort((a, b) => a - b);
    let longest = 1;
    let streak = 1;

    for (let i = 1; i < sorted.length; i++) {
      const diff = (sorted[i] - sorted[i - 1]) / (1000 * 60 * 60 * 24);
      if (diff === 1) {
        streak++;
        longest = Math.max(longest, streak);
      } else {
        streak = 1;
      }
    }

    return { current, longest: Math.max(longest, current) };
  }

  /**
   * Get the next page to memorize based on plan direction
   */
  getNextNewPage(planId: string): number | null {
    const plan = memorizationPlanService.getPlan(planId);
    if (!plan) return null;

    const allProgress = this.getAllProgress(planId);
    const startedPages = new Set(allProgress.map(p => p.pageNumber));

    if (plan.direction === 'forward') {
      for (let page = plan.startPage; page <= plan.endPage; page++) {
        if (!startedPages.has(page)) return page;
      }
    } else {
      for (let page = plan.endPage; page >= plan.startPage; page--) {
        if (!startedPages.has(page)) return page;
      }
    }

    return null; // All pages started
  }

  /**
   * Delete rotation data for a plan
   */
  deleteRotation(planId: string): void {
    if (!this.isLocalStorageAvailable()) return;
    const key = `${this.ROTATION_KEY}_${planId}`;
    localStorage.removeItem(key);
  }

  /**
   * Mark pages as already memorized (for setup wizard).
   * Creates progress entries with 'memorized' status and adds to rotation.
   */
  markPagesAsMemorized(planId: string, pageNumbers: number[]): void {
    for (const page of pageNumbers) {
      let progress = this.getProgress(planId, page);
      if (!progress) {
        progress = memorizationPlanService.initializePageProgress(planId, page);
      }

      memorizationPlanService.updateProgress(planId, page, {
        status: 'memorized',
        ritual: {
          listenCount: this.LISTEN_TARGET,
          readCount: this.READ_TARGET,
          reciteCount: this.RECITE_TARGET,
          surahLinkDone: true,
        },
      });

      this.addPageToRotation(planId, page);
    }
  }
}

export const bilQuranService = new BilQuranService();
