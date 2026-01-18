import { create } from 'zustand';
import type { BattleReport } from '@/types/battle-report';

interface BattleState {
  report: BattleReport | null;
  loading: boolean;
  error: string | null;
  videoId: string | null;
  isExpanded: boolean;

  // Actions
  setReport: (report: BattleReport, videoId: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setVideoId: (videoId: string | null) => void;
  toggleExpanded: () => void;
  reset: () => void;
}

export const useBattleStore = create<BattleState>((set) => ({
  report: null,
  loading: false,
  error: null,
  videoId: null,
  isExpanded: true,

  setReport: (report, videoId) =>
    set({ report, videoId, loading: false, error: null }),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error, loading: false }),

  setVideoId: (videoId) => set({ videoId }),

  toggleExpanded: () => set((state) => ({ isExpanded: !state.isExpanded })),

  reset: () =>
    set({
      report: null,
      loading: false,
      error: null,
      videoId: null,
      isExpanded: true,
    }),
}));
