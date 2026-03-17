import { getNextSurahToMemorize, getCurrentSurahForPage } from '../surahDetection';
import { memorizationPlanService } from '@/services/memorizationPlanService';
import { quranDataService } from '@/services/quranDataService';

// Mock the services
jest.mock('@/services/memorizationPlanService');
jest.mock('@/services/quranDataService');

describe('Surah Detection Logic', () => {
  const mockPlanId = 'test-plan-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getNextSurahToMemorize', () => {
    describe('Forward direction (1 → 114)', () => {
      it('should return Surah 1 when no pages started', () => {
        (memorizationPlanService.getAllProgress as jest.Mock).mockReturnValue([]);
        (quranDataService.getSurahPages as jest.Mock).mockImplementation((surah: number) => {
          // Mock some page numbers for each surah
          if (surah === 1) return [1, 2];
          if (surah === 2) return [3, 4, 5];
          return [surah * 10]; // dummy pages
        });

        const result = getNextSurahToMemorize(mockPlanId, 'forward');
        expect(result).toBe(1);
      });

      it('should return Surah 2 when Surah 1 fully started', () => {
        (memorizationPlanService.getAllProgress as jest.Mock).mockReturnValue([
          { pageNumber: 1 },
          { pageNumber: 2 },
        ]);
        (quranDataService.getSurahPages as jest.Mock).mockImplementation((surah: number) => {
          if (surah === 1) return [1, 2];
          if (surah === 2) return [3, 4, 5];
          return [surah * 10];
        });

        const result = getNextSurahToMemorize(mockPlanId, 'forward');
        expect(result).toBe(2);
      });

      it('should return Surah 69 when Surahs 1-68 are fully started', () => {
        // Mock progress for surahs 1-68
        const mockProgress = [];
        for (let i = 1; i <= 68; i++) {
          mockProgress.push({ pageNumber: i * 10 });
        }
        (memorizationPlanService.getAllProgress as jest.Mock).mockReturnValue(mockProgress);

        (quranDataService.getSurahPages as jest.Mock).mockImplementation((surah: number) => {
          return [surah * 10]; // Each surah has one page for simplicity
        });

        const result = getNextSurahToMemorize(mockPlanId, 'forward');
        expect(result).toBe(69);
      });

      it('should return null when all surahs completed', () => {
        const mockProgress = [];
        for (let i = 1; i <= 114; i++) {
          mockProgress.push({ pageNumber: i * 10 });
        }
        (memorizationPlanService.getAllProgress as jest.Mock).mockReturnValue(mockProgress);

        (quranDataService.getSurahPages as jest.Mock).mockImplementation((surah: number) => {
          return [surah * 10];
        });

        const result = getNextSurahToMemorize(mockPlanId, 'forward');
        expect(result).toBeNull();
      });
    });

    describe('Backward direction (114 → 1)', () => {
      it('should return Surah 114 when no pages started', () => {
        (memorizationPlanService.getAllProgress as jest.Mock).mockReturnValue([]);
        (quranDataService.getSurahPages as jest.Mock).mockImplementation((surah: number) => {
          if (surah === 114) return [604];
          if (surah === 113) return [603];
          return [surah * 5];
        });

        const result = getNextSurahToMemorize(mockPlanId, 'backward');
        expect(result).toBe(114);
      });

      it('should return Surah 113 when Surah 114 fully started', () => {
        (memorizationPlanService.getAllProgress as jest.Mock).mockReturnValue([
          { pageNumber: 604 },
        ]);
        (quranDataService.getSurahPages as jest.Mock).mockImplementation((surah: number) => {
          if (surah === 114) return [604];
          if (surah === 113) return [603];
          return [surah * 5];
        });

        const result = getNextSurahToMemorize(mockPlanId, 'backward');
        expect(result).toBe(113);
      });

      it('should return Surah 69 when Surahs 114-70 are fully started', () => {
        // Mock progress for surahs 70-114
        const mockProgress = [];
        for (let i = 70; i <= 114; i++) {
          mockProgress.push({ pageNumber: i * 5 });
        }
        (memorizationPlanService.getAllProgress as jest.Mock).mockReturnValue(mockProgress);

        (quranDataService.getSurahPages as jest.Mock).mockImplementation((surah: number) => {
          return [surah * 5];
        });

        const result = getNextSurahToMemorize(mockPlanId, 'backward');
        expect(result).toBe(69);
      });

      it('should return null when all surahs completed', () => {
        const mockProgress = [];
        for (let i = 1; i <= 114; i++) {
          mockProgress.push({ pageNumber: i * 5 });
        }
        (memorizationPlanService.getAllProgress as jest.Mock).mockReturnValue(mockProgress);

        (quranDataService.getSurahPages as jest.Mock).mockImplementation((surah: number) => {
          return [surah * 5];
        });

        const result = getNextSurahToMemorize(mockPlanId, 'backward');
        expect(result).toBeNull();
      });
    });

    describe('Multi-page surahs', () => {
      it('should only count surah as started when ALL pages are started', () => {
        (memorizationPlanService.getAllProgress as jest.Mock).mockReturnValue([
          { pageNumber: 1 }, // Only first page of Surah 1
        ]);
        (quranDataService.getSurahPages as jest.Mock).mockImplementation((surah: number) => {
          if (surah === 1) return [1, 2, 3]; // Surah 1 has 3 pages
          return [surah * 10];
        });

        const result = getNextSurahToMemorize(mockPlanId, 'forward');
        // Should still return Surah 1 because not all pages are started
        expect(result).toBe(1);
      });

      it('should move to next surah when all pages of current are started', () => {
        (memorizationPlanService.getAllProgress as jest.Mock).mockReturnValue([
          { pageNumber: 1 },
          { pageNumber: 2 },
          { pageNumber: 3 }, // All pages of Surah 1
        ]);
        (quranDataService.getSurahPages as jest.Mock).mockImplementation((surah: number) => {
          if (surah === 1) return [1, 2, 3];
          if (surah === 2) return [4, 5, 6];
          return [surah * 10];
        });

        const result = getNextSurahToMemorize(mockPlanId, 'forward');
        expect(result).toBe(2);
      });
    });
  });

  describe('getCurrentSurahForPage', () => {
    it('should return next unstarted surah for new material', () => {
      (memorizationPlanService.getPlan as jest.Mock).mockReturnValue({
        id: mockPlanId,
        direction: 'backward',
      });
      (memorizationPlanService.getAllProgress as jest.Mock).mockReturnValue([
        { pageNumber: 604 }, // Surah 114 started
      ]);
      (quranDataService.getSurahPages as jest.Mock).mockImplementation((surah: number) => {
        if (surah === 114) return [604];
        if (surah === 113) return [603];
        return [surah * 5];
      });

      const result = getCurrentSurahForPage(mockPlanId, 603, true);
      expect(result).toBe(113);
    });

    it('should return primary surah for review pages', () => {
      (memorizationPlanService.getPlan as jest.Mock).mockReturnValue({
        id: mockPlanId,
        direction: 'forward',
      });
      (quranDataService.getPagePrimarySurah as jest.Mock).mockReturnValue(42);

      const result = getCurrentSurahForPage(mockPlanId, 123, false);
      expect(result).toBe(42);
      expect(quranDataService.getPagePrimarySurah).toHaveBeenCalledWith(123);
    });

    it('should return null if plan not found', () => {
      (memorizationPlanService.getPlan as jest.Mock).mockReturnValue(null);

      const result = getCurrentSurahForPage(mockPlanId, 123, true);
      expect(result).toBeNull();
    });
  });

  describe('Consistency across components', () => {
    it('Dashboard and BilQuranSession should get same surah for same state', () => {
      const sharedState = {
        progress: [{ pageNumber: 604 }], // Surah 114 started
        direction: 'backward' as const,
      };

      (memorizationPlanService.getPlan as jest.Mock).mockReturnValue({
        id: mockPlanId,
        direction: sharedState.direction,
      });
      (memorizationPlanService.getAllProgress as jest.Mock).mockReturnValue(sharedState.progress);
      (quranDataService.getSurahPages as jest.Mock).mockImplementation((surah: number) => {
        if (surah === 114) return [604];
        if (surah === 113) return [603];
        return [surah * 5];
      });

      // Call from Dashboard context
      const dashboardResult = getNextSurahToMemorize(mockPlanId, sharedState.direction);

      // Call from BilQuranSession context (new material)
      const sessionResult = getCurrentSurahForPage(mockPlanId, 603, true);

      // Both should return Surah 113
      expect(dashboardResult).toBe(113);
      expect(sessionResult).toBe(113);
      expect(dashboardResult).toBe(sessionResult);
    });
  });
});
