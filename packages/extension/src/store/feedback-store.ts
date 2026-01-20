import { create } from 'zustand';
import type { FeedbackItem, UserMapping } from '@battlereport/shared/types';
import {
  getUserMappings,
  saveUserMapping,
  deleteUserMapping,
  saveUserMappings,
} from '@/utils/storage';

interface FeedbackState {
  // Current session feedback items
  feedbackItems: FeedbackItem[];

  // Persisted user mappings
  userMappings: UserMapping[];

  // Loading state
  isLoading: boolean;

  // Actions
  setFeedbackItems: (items: FeedbackItem[]) => void;
  addFeedbackItem: (item: FeedbackItem) => void;
  addFeedbackItems: (items: FeedbackItem[]) => void;

  resolveFeedbackItem: (itemId: string, canonicalName: string, saveMapping?: boolean) => Promise<void>;
  ignoreFeedbackItem: (itemId: string) => void;
  acceptSuggestion: (itemId: string, suggestionName: string, saveMapping?: boolean) => Promise<void>;

  clearFeedbackItems: () => void;

  // User mapping actions
  loadUserMappings: () => Promise<void>;
  addUserMapping: (mapping: UserMapping) => Promise<void>;
  removeUserMapping: (mappingId: string) => Promise<void>;
  incrementMappingUsage: (mappingId: string) => Promise<void>;
  clearAllMappings: () => Promise<void>;

  // Export/Import
  exportMappings: () => string;
  importMappings: (json: string) => Promise<void>;

  // Computed
  getPendingCount: () => number;
  hasPendingFeedback: () => boolean;
  findMapping: (alias: string, entityType: string, factionId?: string) => UserMapping | undefined;
}

export const useFeedbackStore = create<FeedbackState>((set, get) => ({
  feedbackItems: [],
  userMappings: [],
  isLoading: false,

  setFeedbackItems: (items) => set({ feedbackItems: items }),

  addFeedbackItem: (item) =>
    set((state) => ({
      feedbackItems: [...state.feedbackItems, item],
    })),

  addFeedbackItems: (items) =>
    set((state) => ({
      feedbackItems: [...state.feedbackItems, ...items],
    })),

  resolveFeedbackItem: async (itemId, canonicalName, saveMapping = false) => {
    const state = get();
    const item = state.feedbackItems.find((f) => f.id === itemId);
    if (!item) return;

    // Update the feedback item status
    set((state) => ({
      feedbackItems: state.feedbackItems.map((f) =>
        f.id === itemId
          ? { ...f, status: 'resolved' as const, resolvedTo: canonicalName }
          : f
      ),
    }));

    // Save as user mapping if requested
    if (saveMapping) {
      const mapping: UserMapping = {
        id: `mapping-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        alias: item.originalToken.toLowerCase(),
        canonicalName,
        entityType: item.entityType,
        factionId: item.factionId,
        createdAt: Date.now(),
        usageCount: 1,
      };
      await get().addUserMapping(mapping);
    }
  },

  ignoreFeedbackItem: (itemId) =>
    set((state) => ({
      feedbackItems: state.feedbackItems.map((f) =>
        f.id === itemId ? { ...f, status: 'ignored' as const } : f
      ),
    })),

  acceptSuggestion: async (itemId, suggestionName, saveMapping = false) => {
    await get().resolveFeedbackItem(itemId, suggestionName, saveMapping);
  },

  clearFeedbackItems: () => set({ feedbackItems: [] }),

  loadUserMappings: async () => {
    set({ isLoading: true });
    try {
      const mappings = await getUserMappings();
      set({ userMappings: mappings, isLoading: false });
    } catch (error) {
      console.error('Failed to load user mappings:', error);
      set({ isLoading: false });
    }
  },

  addUserMapping: async (mapping) => {
    try {
      await saveUserMapping(mapping);
      set((state) => ({
        userMappings: [...state.userMappings, mapping],
      }));
    } catch (error) {
      console.error('Failed to save user mapping:', error);
    }
  },

  removeUserMapping: async (mappingId) => {
    try {
      await deleteUserMapping(mappingId);
      set((state) => ({
        userMappings: state.userMappings.filter((m) => m.id !== mappingId),
      }));
    } catch (error) {
      console.error('Failed to delete user mapping:', error);
    }
  },

  incrementMappingUsage: async (mappingId) => {
    const state = get();
    const mapping = state.userMappings.find((m) => m.id === mappingId);
    if (!mapping) return;

    const updatedMapping = { ...mapping, usageCount: mapping.usageCount + 1 };

    try {
      // Update in storage
      const updatedMappings = state.userMappings.map((m) =>
        m.id === mappingId ? updatedMapping : m
      );
      await saveUserMappings(updatedMappings);

      set({ userMappings: updatedMappings });
    } catch (error) {
      console.error('Failed to increment mapping usage:', error);
    }
  },

  clearAllMappings: async () => {
    try {
      await saveUserMappings([]);
      set({ userMappings: [] });
    } catch (error) {
      console.error('Failed to clear mappings:', error);
    }
  },

  exportMappings: () => {
    const state = get();
    return JSON.stringify(state.userMappings, null, 2);
  },

  importMappings: async (json) => {
    try {
      const imported = JSON.parse(json) as UserMapping[];
      // Validate structure
      if (!Array.isArray(imported)) {
        throw new Error('Invalid format: expected array');
      }

      // Merge with existing, avoiding duplicates by alias+entityType+factionId
      const existing = get().userMappings;
      const existingKeys = new Set(
        existing.map((m) => `${m.alias}:${m.entityType}:${m.factionId || ''}`)
      );

      const newMappings = imported.filter((m) => {
        const key = `${m.alias}:${m.entityType}:${m.factionId || ''}`;
        return !existingKeys.has(key);
      });

      const merged = [...existing, ...newMappings];
      await saveUserMappings(merged);
      set({ userMappings: merged });
    } catch (error) {
      console.error('Failed to import mappings:', error);
      throw error;
    }
  },

  getPendingCount: () => {
    return get().feedbackItems.filter((f) => f.status === 'pending').length;
  },

  hasPendingFeedback: () => {
    return get().feedbackItems.some((f) => f.status === 'pending');
  },

  findMapping: (alias, entityType, factionId) => {
    const state = get();
    const normalizedAlias = alias.toLowerCase();

    // First try faction-specific match
    if (factionId) {
      const factionMatch = state.userMappings.find(
        (m) =>
          m.alias === normalizedAlias &&
          m.entityType === entityType &&
          m.factionId === factionId
      );
      if (factionMatch) return factionMatch;
    }

    // Fall back to generic match (no faction)
    return state.userMappings.find(
      (m) =>
        m.alias === normalizedAlias &&
        m.entityType === entityType &&
        !m.factionId
    );
  },
}));
