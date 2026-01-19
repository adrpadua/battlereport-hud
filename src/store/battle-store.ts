import { create } from 'zustand';
import type { BattleReport, Unit } from '@/types/battle-report';
import type { VideoData } from '@/types/youtube';

export type ExtractionPhase =
  | 'idle'           // Ready to extract
  | 'extracting'     // Getting video data
  | 'faction-select' // Waiting for user faction confirmation
  | 'preprocessing'  // Running preprocessor
  | 'ai-extracting'  // Calling OpenAI
  | 'complete'       // Showing results
  | 'error';         // Error state

interface BattleState {
  report: BattleReport | null;
  loading: boolean;
  error: string | null;
  videoId: string | null;
  isExpanded: boolean;

  // Phased extraction state
  phase: ExtractionPhase;
  statusMessage: string;
  videoData: VideoData | null;
  detectedFactions: string[];
  selectedFactions: [string, string] | null;
  allFactions: string[];

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

  // Phased extraction actions
  setPhase: (phase: ExtractionPhase, statusMessage?: string) => void;
  setVideoData: (videoData: VideoData) => void;
  setDetectedFactions: (factions: string[], allFactions: string[]) => void;
  setSelectedFactions: (factions: [string, string]) => void;
  startExtraction: () => void;
}

export const useBattleStore = create<BattleState>((set) => ({
  report: null,
  loading: false,
  error: null,
  videoId: null,
  isExpanded: true,

  // Phased extraction defaults
  phase: 'idle',
  statusMessage: '',
  videoData: null,
  detectedFactions: [],
  selectedFactions: null,
  allFactions: [],

  setReport: (report, videoId) =>
    set({ report, videoId, loading: false, error: null, phase: 'complete' }),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error, loading: false, phase: 'error' }),

  setVideoId: (videoId) => set({ videoId }),

  toggleExpanded: () => set((state) => ({ isExpanded: !state.isExpanded })),

  reset: () =>
    set({
      report: null,
      loading: false,
      error: null,
      videoId: null,
      isExpanded: true,
      phase: 'idle',
      statusMessage: '',
      videoData: null,
      detectedFactions: [],
      selectedFactions: null,
      allFactions: [],
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

  // Phased extraction actions
  setPhase: (phase, statusMessage = '') =>
    set({ phase, statusMessage }),

  setVideoData: (videoData) =>
    set({ videoData }),

  setDetectedFactions: (factions, allFactions) => {
    // Pre-select first two detected factions as defaults
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

  setSelectedFactions: (factions) =>
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
