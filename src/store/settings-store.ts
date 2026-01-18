import { create } from 'zustand';

interface SettingsState {
  apiKey: string | null;
  hudPosition: 'left' | 'right';
  autoExtract: boolean;

  // Actions
  setApiKey: (apiKey: string | null) => void;
  setHudPosition: (position: 'left' | 'right') => void;
  setAutoExtract: (autoExtract: boolean) => void;
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  apiKey: null,
  hudPosition: 'right',
  autoExtract: true,

  setApiKey: (apiKey) => {
    set({ apiKey });
    get().saveSettings();
  },

  setHudPosition: (hudPosition) => {
    set({ hudPosition });
    get().saveSettings();
  },

  setAutoExtract: (autoExtract) => {
    set({ autoExtract });
    get().saveSettings();
  },

  loadSettings: async () => {
    try {
      const result = await chrome.storage.local.get([
        'apiKey',
        'hudPosition',
        'autoExtract',
      ]);
      set({
        apiKey: result.apiKey ?? null,
        hudPosition: result.hudPosition ?? 'right',
        autoExtract: result.autoExtract ?? true,
      });
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  },

  saveSettings: async () => {
    try {
      const state = get();
      await chrome.storage.local.set({
        apiKey: state.apiKey,
        hudPosition: state.hudPosition,
        autoExtract: state.autoExtract,
      });
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  },
}));
