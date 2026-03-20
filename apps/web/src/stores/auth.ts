import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { EveCharacter } from '@monipoch/shared';

interface AuthState {
  token: string | null;
  character: EveCharacter | null;
  setAuth: (token: string, character: EveCharacter) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      character: null,
      setAuth: (token, character) => set({ token, character }),
      logout: () => set({ token: null, character: null }),
    }),
    { name: 'monipoch-auth' },
  ),
);
