export interface EveCharacter {
  characterId: number;
  characterName: string;
  corporationId: number;
  corporationName?: string;
  allianceId?: number;
  allianceName?: string;
  portraitUrl?: string;
}

export interface SessionUser {
  userId: number;
  character: EveCharacter;
  scopes: string[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}
