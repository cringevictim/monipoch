import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import {
  POCHVEN_CONNECTIONS,
  POCHVEN_SYSTEM_BY_ID,
  type ESIKillmail,
  type ZKBMetadata,
} from '@monipoch/shared';

const ROAM_WINDOW_MS = 30 * 60 * 1000;
const ROAM_EXPIRE_MS = 30 * 60 * 1000;

interface SystemEntry {
  systemId: number;
  systemName: string;
  timestamp: number;
}

export interface RoamingFleet {
  id: string;
  groupName: string;
  groupAllianceId: number | null;
  systemHistory: SystemEntry[];
  shipTypes: number[];
  lastKillAt: Date;
}

interface KillmailPochvenPayload {
  killmail: ESIKillmail;
  zkb: ZKBMetadata;
  systemName: string;
}

@Injectable()
export class RoamingFleetService {
  private readonly logger = new Logger(RoamingFleetService.name);
  private activeRoams = new Map<string, RoamingFleet>();
  private recentKillsByGroup = new Map<string, SystemEntry[]>();

  constructor(private eventEmitter: EventEmitter2) {}

  @OnEvent('killmail.pochven')
  async handleKill(payload: KillmailPochvenPayload): Promise<void> {
    const { killmail, systemName } = payload;
    const systemId = killmail.solar_system_id;
    const killTime = new Date(killmail.killmail_time).getTime();

    const dominant = this.getDominantAttacker(killmail);
    if (!dominant) return;

    const groupKey = dominant.alliance_id != null ? `a:${dominant.alliance_id}` : `c:${dominant.corporation_id}`;
    const groupName = groupKey;
    const groupAllianceId = dominant.alliance_id ?? null;

    const entry: SystemEntry = { systemId, systemName, timestamp: killTime };

    const recent = this.recentKillsByGroup.get(groupKey) ?? [];
    recent.push(entry);
    this.recentKillsByGroup.set(groupKey, recent);
    this.cleanupRecentKills(groupKey);

    const shipTypes = this.collectShipTypes(killmail);

    const connectedKill = recent.find(
      (k) =>
        k.systemId !== systemId &&
        killTime - k.timestamp <= ROAM_WINDOW_MS &&
        this.areSystemsConnected(k.systemName, systemName),
    );

    let roam = this.activeRoams.get(groupKey);

    if (roam) {
      const lastSystem = roam.systemHistory[roam.systemHistory.length - 1];
      if (lastSystem && lastSystem.systemId !== systemId && this.areSystemsConnected(lastSystem.systemName, systemName)) {
        roam.systemHistory.push(entry);
        roam.shipTypes = [...new Set([...roam.shipTypes, ...shipTypes])];
        roam.lastKillAt = new Date(killTime);
        this.emitRoamTracked(roam);
      }
    } else if (connectedKill) {
      roam = {
        id: randomUUID(),
        groupName,
        groupAllianceId,
        systemHistory: [
          { systemId: connectedKill.systemId, systemName: connectedKill.systemName, timestamp: connectedKill.timestamp },
          entry,
        ],
        shipTypes,
        lastKillAt: new Date(killTime),
      };
      this.activeRoams.set(groupKey, roam);
      this.emitRoamTracked(roam);
    } else {
      roam = {
        id: randomUUID(),
        groupName,
        groupAllianceId,
        systemHistory: [entry],
        shipTypes,
        lastKillAt: new Date(killTime),
      };
      this.activeRoams.set(groupKey, roam);
      this.emitRoamTracked(roam);
    }
  }

  @Cron('*/2 * * * *')
  expireInactiveRoams(): void {
    const cutoff = Date.now() - ROAM_EXPIRE_MS;
    for (const [key, roam] of this.activeRoams.entries()) {
      if (new Date(roam.lastKillAt).getTime() < cutoff) {
        this.activeRoams.delete(key);
        this.recentKillsByGroup.delete(key);
        this.logger.log(`Expired roam for ${roam.groupName}`);
      }
    }
    const killCutoff = Date.now() - ROAM_WINDOW_MS;
    for (const [key, kills] of this.recentKillsByGroup.entries()) {
      const filtered = kills.filter((k) => k.timestamp > killCutoff);
      if (filtered.length === 0) {
        this.recentKillsByGroup.delete(key);
      } else {
        this.recentKillsByGroup.set(key, filtered);
      }
    }
  }

  getActiveRoams(): Array<RoamingFleet & { predictedNext: string[] }> {
    return Array.from(this.activeRoams.values())
      .filter((roam) => roam.shipTypes.length >= 2)
      .map((roam) => {
        const next = this.predictNextSystem(roam);
        return { ...roam, predictedNext: next ? [next] : [] };
      });
  }

  private getDominantAttacker(killmail: ESIKillmail): { alliance_id?: number; corporation_id?: number } | null {
    const finalBlow = killmail.attackers.find((a) => a.final_blow);
    if (finalBlow && (finalBlow.alliance_id ?? finalBlow.corporation_id)) {
      return finalBlow;
    }
    const sorted = [...killmail.attackers]
      .filter((a) => a.alliance_id ?? a.corporation_id)
      .sort((a, b) => b.damage_done - a.damage_done);
    return sorted[0] ?? null;
  }

  private collectShipTypes(killmail: ESIKillmail): number[] {
    const ids = new Set<number>();
    for (const a of killmail.attackers) {
      if (a.ship_type_id) ids.add(a.ship_type_id);
    }
    return Array.from(ids);
  }

  private areSystemsConnected(nameA: string, nameB: string): boolean {
    if (nameA === nameB) return true;
    return POCHVEN_CONNECTIONS.some(
      ([a, b]) => (a === nameA && b === nameB) || (a === nameB && b === nameA),
    );
  }

  private getConnectedSystemNames(systemName: string): string[] {
    const connected: string[] = [];
    for (const [a, b] of POCHVEN_CONNECTIONS) {
      if (a === systemName) connected.push(b);
      if (b === systemName) connected.push(a);
    }
    return connected;
  }

  private predictNextSystem(roam: RoamingFleet): string | null {
    const last = roam.systemHistory[roam.systemHistory.length - 1];
    if (!last) return null;

    const connected = this.getConnectedSystemNames(last.systemName);
    const visitedRecently = new Set(
      roam.systemHistory.slice(-5).map((s) => s.systemName),
    );

    for (const name of connected) {
      if (!visitedRecently.has(name)) return name;
    }
    return connected[0] ?? null;
  }

  private emitRoamTracked(roam: RoamingFleet): void {
    const predictedNext = this.predictNextSystem(roam);
    this.eventEmitter.emit('roam.tracked', {
      roam: {
        id: roam.id,
        groupName: roam.groupName,
        systemHistory: roam.systemHistory,
        predictedNext,
        shipTypes: roam.shipTypes,
        lastKillAt: roam.lastKillAt,
      },
    });
  }

  private cleanupRecentKills(groupKey: string): void {
    const kills = this.recentKillsByGroup.get(groupKey);
    if (!kills) return;
    const cutoff = Date.now() - ROAM_WINDOW_MS;
    const filtered = kills.filter((k) => k.timestamp > cutoff);
    if (filtered.length === 0) {
      this.recentKillsByGroup.delete(groupKey);
    } else {
      this.recentKillsByGroup.set(groupKey, filtered);
    }
  }
}
