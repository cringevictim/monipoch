import { create } from 'zustand';

export type OverlayPanel =
  | 'notifications'
  | 'analytics'
  | 'settings'
  | null;

interface OverlayState {
  activePanel: OverlayPanel;
  openPanel: (panel: OverlayPanel) => void;
  closePanel: () => void;
  togglePanel: (panel: OverlayPanel) => void;
}

export const useOverlayStore = create<OverlayState>()((set, get) => ({
  activePanel: null,
  openPanel: (panel) => set({ activePanel: panel }),
  closePanel: () => set({ activePanel: null }),
  togglePanel: (panel) =>
    set({ activePanel: get().activePanel === panel ? null : panel }),
}));
