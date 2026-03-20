import { create } from 'zustand';

export type TimeWindow = '1h' | '6h' | '24h' | '7d';

interface MapState {
  timeWindow: TimeWindow;
  selectedSystemId: number | null;
  selectedTacticalId: string | null;
  soundEnabled: boolean;
  setTimeWindow: (tw: TimeWindow) => void;
  selectSystem: (id: number | null) => void;
  selectTactical: (id: string | null) => void;
  toggleSound: () => void;
}

export const useMapStore = create<MapState>()((set) => ({
  timeWindow: '1h',
  selectedSystemId: null,
  selectedTacticalId: null,
  soundEnabled: true,
  setTimeWindow: (timeWindow) => set({ timeWindow }),
  selectSystem: (selectedSystemId) => set({ selectedSystemId }),
  selectTactical: (selectedTacticalId) => set({ selectedTacticalId }),
  toggleSound: () => set((s) => ({ soundEnabled: !s.soundEnabled })),
}));
