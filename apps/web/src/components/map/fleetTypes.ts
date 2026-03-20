export interface FleetGroupCharacter {
  characterId: number;
  corporationId?: number;
  allianceId?: number;
  shipTypeId?: number;
}

export interface FleetGroupResponse {
  id: string;
  type: 'camp' | 'roam';
  currentSystemId: number;
  systemName: string;
  anchorGateName: string | null;
  characters: FleetGroupCharacter[];
  shipTypes: number[];
  systemHistory: Array<{ systemId: number; systemName: string; timestamp: number }>;
  killCount: number;
  firstSeenAt: string;
  lastKillAt: string;
  predictedNext: string[];
}
