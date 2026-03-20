import { create } from 'zustand';

interface CharacterIntelState {
  selectedCharacterId: number | null;
  selectedCharacterName: string;
  open: boolean;
  openCharacterIntel: (characterId: number, name: string) => void;
  close: () => void;
}

export const useCharacterIntelStore = create<CharacterIntelState>((set) => ({
  selectedCharacterId: null,
  selectedCharacterName: '',
  open: false,
  openCharacterIntel: (characterId, name) =>
    set({
      selectedCharacterId: characterId,
      selectedCharacterName: name,
      open: true,
    }),
  close: () =>
    set({
      selectedCharacterId: null,
      selectedCharacterName: '',
      open: false,
    }),
}));
