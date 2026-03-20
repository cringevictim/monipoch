export enum FightStatus {
  ONGOING = 'ongoing',
  CONCLUDED = 'concluded',
}

export enum FightClassification {
  SOLO = 'solo',
  SMALL_GANG = 'small_gang',
  MEDIUM_GANG = 'medium_gang',
  LARGE_FLEET = 'large_fleet',
  CAPITAL_ESCALATION = 'capital_escalation',
}

export interface FightSide {
  allianceId: number | null;
  allianceName?: string;
  corporationIds: number[];
  characterIds: number[];
  shipTypeIds: number[];
  pilotCount: number;
  iskLost: number;
  killCount: number;
}

export interface DetectedFight {
  id: string;
  systemId: number;
  systemName: string;
  status: FightStatus;
  classification: FightClassification;
  startedAt: string;
  lastKillAt: string;
  /** Wall-clock time when the last kill was received by the server (may differ from lastKillAt for late-arriving kills). */
  lastReceivedAt: string;
  endedAt?: string;
  sides: FightSide[];
  totalKills: number;
  totalIskDestroyed: number;
  killmailIds: number[];
}
