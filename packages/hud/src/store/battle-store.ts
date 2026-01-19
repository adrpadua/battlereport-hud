import { create } from 'zustand';
import type { BattleStore, BattleReport, Unit, VideoData, ExtractionPhase } from '../types';

const initialState = {
  report: null,
  loading: false,
  error: null,
  videoId: null,
  isExpanded: true,
  phase: 'idle' as ExtractionPhase,
  statusMessage: '',
  videoData: null,
  detectedFactions: [],
  selectedFactions: null,
  allFactions: [],
};

export const useBattleStore = create<BattleStore>((set) => ({
  ...initialState,

  setReport: (report: BattleReport, videoId: string) =>
    set({ report, videoId, loading: false, error: null, phase: 'complete' }),

  setLoading: (loading: boolean) => set({ loading }),

  setError: (error: string | null) => set({ error, loading: false, phase: 'error' }),

  setVideoId: (videoId: string | null) => set({ videoId }),

  toggleExpanded: () => set((state) => ({ isExpanded: !state.isExpanded })),

  reset: () => set(initialState),

  updateUnit: (unitIndex: number, updates: Partial<Unit>) =>
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

  acceptSuggestion: (unitIndex: number) =>
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
        suggestedMatch: undefined,
      };

      return {
        report: {
          ...state.report,
          units: newUnits,
        },
      };
    }),

  setPhase: (phase: ExtractionPhase, statusMessage = '') =>
    set({ phase, statusMessage }),

  setVideoData: (videoData: VideoData) =>
    set({ videoData }),

  setDetectedFactions: (factions: string[], allFactions: string[]) => {
    let selectedFactions: [string, string] | null = null;
    if (factions.length >= 2 && factions[0] && factions[1]) {
      selectedFactions = [factions[0], factions[1]];
    } else if (factions.length === 1 && factions[0]) {
      selectedFactions = [factions[0], factions[0]];
    }

    set({
      detectedFactions: factions,
      allFactions,
      selectedFactions,
    });
  },

  setSelectedFactions: (factions: [string, string]) =>
    set({ selectedFactions: factions }),

  startExtraction: () =>
    set({
      phase: 'extracting',
      statusMessage: 'Extracting video data...',
      loading: true,
      error: null,
      report: null,
    }),
}));
