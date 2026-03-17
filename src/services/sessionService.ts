import { StudySession } from '@/types/memorization';
import { bilQuranService } from './bilQuranService';
import { memorizationPlanService } from './memorizationPlanService';

/**
 * Session service — creates and manages daily study sessions.
 * Replaces the old reviewQueueService.
 *
 * Each day's session has up to two parts:
 * 1. Review: one rotation chunk (round-robin)
 * 2. New material: the next unstarted page's ritual
 */

class SessionService {
  createTodaySession(planId: string): StudySession {
    // Check if there's already a session for today
    const existing = memorizationPlanService.getTodaySession(planId);
    if (existing && !existing.completed) return existing;

    const reviewChunk = bilQuranService.getTodayReviewChunk(planId);
    const nextPage = bilQuranService.getNextNewPage(planId);

    const session: StudySession = {
      id: `session-${Date.now()}`,
      planId,
      date: new Date().toISOString(),
      reviewChunk: reviewChunk ? {
        chunkId: reviewChunk.id,
        completed: false,
      } : undefined,
      newMaterial: nextPage ? {
        pageNumber: nextPage,
        ritual: { listenCount: 0, readCount: 0, reciteCount: 0, surahLinkDone: false },
        completed: false,
      } : undefined,
      duration: 0,
      completed: false,
      createdAt: new Date().toISOString(),
    };

    return memorizationPlanService.createSession(session);
  }

  getTodaySummary(planId: string): {
    reviewChunk: { chunkId: string; surahNumber: number; pages: number[] } | null;
    newMaterial: { pageNumber: number } | null;
    hasActiveSession: boolean;
  } {
    const reviewChunk = bilQuranService.getTodayReviewChunk(planId);
    const nextPage = bilQuranService.getNextNewPage(planId);
    const todaySession = memorizationPlanService.getTodaySession(planId);

    return {
      reviewChunk: reviewChunk ? {
        chunkId: reviewChunk.id,
        surahNumber: reviewChunk.surahNumber,
        pages: reviewChunk.pages,
      } : null,
      newMaterial: nextPage ? { pageNumber: nextPage } : null,
      hasActiveSession: todaySession !== null && !todaySession.completed,
    };
  }
}

export const sessionService = new SessionService();
