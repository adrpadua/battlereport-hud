import { create } from 'zustand';
import type { BattleReport, Unit } from '@/types/battle-report';

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
  // Update a specific unit (e.g., accept suggestion)
  updateUnit: (unitIndex: number, updates: Partial<Unit>) => void;
  // Accept a suggested match for a unit
  acceptSuggestion: (unitIndex: number) => void;
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

  updateUnit: (unitIndex, updates) =>
    set((state) => {
      if (!state.report) return state;

      const newUnits = [...state.report.units];
      const unit = newUnits[unitIndex];
      if (unit) {
        newUnits[unitIndex] = { ...unit, ...updates };
      }

      return {
        report: {
          ...state.report,
          units: newUnits,
        },
      };
    }),

  acceptSuggestion: (unitIndex) =>
    set((state) => {
      if (!state.report) return state;

      const unit = state.report.units[unitIndex];
      if (!unit?.suggestedMatch) return state;

      const newUnits = [...state.report.units];
      newUnits[unitIndex] = {
        ...unit,
        name: unit.suggestedMatch.name,
        confidence: 'high',
        isValidated: true,
        stats: unit.suggestedMatch.stats,
        keywords: unit.suggestedMatch.keywords,
        pointsCost: unit.suggestedMatch.pointsCost ?? unit.pointsCost,
        suggestedMatch: undefined, // Clear the suggestion after accepting
      };

      return {
        report: {
          ...state.report,
          units: newUnits,
        },
      };
    }),
}));
