import type { DetectedFight } from './fight';
import type { ESIKillmail, ZKBMetadata } from './killmail';

export enum WsEventType {
  KILL_NEW = 'kill.new',
  FIGHT_STARTED = 'fight.started',
  FIGHT_UPDATED = 'fight.updated',
  FIGHT_ENDED = 'fight.ended',
  CAMP_DETECTED = 'camp.detected',
  ROAM_TRACKED = 'roam.tracked',
  HEATMAP_UPDATE = 'heatmap.update',
  INTEL_REPORT = 'intel.report',
  WH_CONNECTION = 'wh.connection',
  NOTIFICATION = 'notification',
}

export interface WsKillEvent {
  type: WsEventType.KILL_NEW;
  killmail: ESIKillmail;
  zkb: ZKBMetadata;
  systemName: string;
}

export interface WsFightEvent {
  type:
    | WsEventType.FIGHT_STARTED
    | WsEventType.FIGHT_UPDATED
    | WsEventType.FIGHT_ENDED;
  fight: DetectedFight;
}

export interface WsHeatmapUpdate {
  type: WsEventType.HEATMAP_UPDATE;
  systems: Record<number, { kills1h: number; kills6h: number; kills24h: number }>;
}

export interface WsCampDetected {
  type: WsEventType.CAMP_DETECTED;
  systemId: number;
  systemName: string;
  attackerAllianceId?: number;
  attackerCorpId?: number;
  attackerEntityName?: string;
  shipTypes: number[];
  killCount: number;
  detectedAt: string;
}

export interface WsRoamTracked {
  type: WsEventType.ROAM_TRACKED;
  entityId: number;
  entityName: string;
  entityType: 'alliance' | 'corporation';
  path: Array<{ systemId: number; systemName: string; timestamp: string }>;
  shipTypes: number[];
  pilotCount: number;
  predictedNextSystemId?: number;
}

export interface WsNotificationEvent {
  type: WsEventType.NOTIFICATION;
  eventType: string;
  title: string;
  description: string;
}

export type WsEvent =
  | WsKillEvent
  | WsFightEvent
  | WsHeatmapUpdate
  | WsCampDetected
  | WsRoamTracked
  | WsNotificationEvent;
