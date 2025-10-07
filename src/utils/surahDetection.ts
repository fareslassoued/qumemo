import { quranDataService } from '@/services/quranDataService';
import { memorizationPlanService } from '@/services/memorizationPlanService';

/**
 * Find the next unstarted surah to memorize based on plan direction
 * This is the single source of truth for determining which surah to memorize next
 */
export function getNextSurahToMemorize(
  planId: string,
  direction: 'forward' | 'backward'
): number | null {
  const allProgress = memorizationPlanService.getAllProgress(planId);

  if (direction === 'forward') {
    // Forward: Start from Surah 1
    for (let surah = 1; surah <= 114; surah++) {
      const surahPages = quranDataService.getSurahPages(surah);
      const allPagesStarted = surahPages.every(page =>
        allProgress.some(p => p.pageNumber === page)
      );

      if (!allPagesStarted) {
        return surah;
      }
    }
  } else {
    // Backward: Start from Surah 114
    for (let surah = 114; surah >= 1; surah--) {
      const surahPages = quranDataService.getSurahPages(surah);
      const allPagesStarted = surahPages.every(page =>
        allProgress.some(p => p.pageNumber === page)
      );

      if (!allPagesStarted) {
        return surah;
      }
    }
  }

  return null; // All surahs completed
}

/**
 * Get the surah that should be memorized for a given page in the session
 * For new material: returns the next unstarted surah based on plan direction
 * For reviews: returns the primary surah on that page
 */
export function getCurrentSurahForPage(
  planId: string,
  pageNumber: number,
  isNewMaterial: boolean
): number | null {
  const plan = memorizationPlanService.getPlan(planId);
  if (!plan) return null;

  if (isNewMaterial) {
    // For new material, return the next unstarted surah
    return getNextSurahToMemorize(planId, plan.direction);
  }

  // For reviews, get the primary surah on the page
  return quranDataService.getPagePrimarySurah(pageNumber);
}
