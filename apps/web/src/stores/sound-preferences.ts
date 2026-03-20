import { create } from 'zustand';
import { apiJson, apiFetch } from '@/lib/api';

export interface SoundPreferences {
  kill_sound: boolean;
  fight_sound: boolean;
  camp_sound: boolean;
  roam_sound: boolean;
}

interface SoundPreferencesState {
  preferences: SoundPreferences;
  loaded: boolean;
  load: () => Promise<void>;
  update: (partial: Partial<SoundPreferences>) => Promise<void>;
}

const DEFAULTS: SoundPreferences = {
  kill_sound: true,
  fight_sound: true,
  camp_sound: true,
  roam_sound: true,
};

export const useSoundPreferences = create<SoundPreferencesState>()((set, get) => ({
  preferences: { ...DEFAULTS },
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const prefs = await apiJson<SoundPreferences>('/api/notifications/sounds');
      set({ preferences: prefs, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  update: async (partial) => {
    const prev = get().preferences;
    const next = { ...prev, ...partial };
    set({ preferences: next });

    try {
      await apiFetch('/api/notifications/sounds', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
      });
    } catch {
      set({ preferences: prev });
    }
  },
}));

export function shouldPlaySound(eventType: string): boolean {
  const { preferences } = useSoundPreferences.getState();
  switch (eventType) {
    case 'kill.new':
    case 'killmail.pochven':
      return preferences.kill_sound;
    case 'fight.started':
    case 'fight.updated':
    case 'fight.ended':
    case 'fight.update':
      return preferences.fight_sound;
    case 'camp.detected':
      return preferences.camp_sound;
    case 'roam.tracked':
      return preferences.roam_sound;
    default:
      return false;
  }
}
