import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import {
  POCHVEN_CONNECTIONS,
  POCHVEN_SYSTEM_BY_ID,
  POCHVEN_SYSTEM_IDS,
  type ESIKillmail,
  type ZKBMetadata,
} from '@monipoch/shared';

const EXPIRE_MS = 30 * 60 * 1000;
const JACCARD_THRESHOLD = 0.3;
const OVERLAP_THRESHOLD = 0.5;
const MIN_FLEET_SIZE = 2;

interface CharacterInfo {
  characterId: number;
  corporationId?: number;
  allianceId?: number;
  shipTypeId?: number;
}

export interface FleetGroup {
  id: string;
  characters: Map<number, CharacterInfo>;
  shipTypes: Set<number>;
  systemHistory: { systemId: number; systemName: string; timestamp: number }[];
  currentSystemId: number;
  killCount: number;
  anchorGateId: number | null;
  anchorKills: number;
  nonAnchorKills: number;
  firstSeenAt: number;
  lastKillAt: number;
  killmailIds: Set<number>;
}

export interface FleetGroupResponse {
  id: string;
  type: 'camp' | 'roam';
  currentSystemId: number;
  systemName: string;
  anchorGateName: string | null;
  characters: Array<{
    characterId: number;
    corporationId?: number;
    allianceId?: number;
    shipTypeId?: number;
  }>;
  shipTypes: number[];
  systemHistory: Array<{ systemId: number; systemName: string; timestamp: number }>;
  killCount: number;
  firstSeenAt: string;
  lastKillAt: string;
  predictedNext: string[];
}

interface KillmailPochvenPayload {
  killmail: ESIKillmail;
  zkb: ZKBMetadata;
  systemName: string;
}

interface EsiSystemResponse {
  stargates?: number[];
}

@Injectable()
export class FleetTrackerService implements OnModuleInit {
  private readonly logger = new Logger(FleetTrackerService.name);
  private groups = new Map<string, FleetGroup>();
  private stargateIds = new Set<number>();
  private stargateNames = new Map<number, string>();

  constructor(private eventEmitter: EventEmitter2) {}

  async onModuleInit(): Promise<void> {
    await this.loadStargateIds();
  }

  private async loadStargateIds(): Promise<void> {
    const systemIds = Array.from(POCHVEN_SYSTEM_IDS);
    this.logger.log(`Fetching stargates for ${systemIds.length} Pochven systems...`);

    const BATCH = 5;
    const DELAY_MS = 1200;

    const allGateIds: number[] = [];
    for (let i = 0; i < systemIds.length; i += BATCH) {
      const batch = systemIds.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(async (sysId) => {
          const resp = await fetch(
            `https://esi.evetech.net/latest/universe/systems/${sysId}/?datasource=tranquility`,
          );
          if (!resp.ok) return [];
          const data: EsiSystemResponse = await resp.json();
          return data.stargates ?? [];
        }),
      );
      for (const result of results) {
        if (result.status === 'fulfilled') {
          for (const gateId of result.value) {
            this.stargateIds.add(gateId);
            allGateIds.push(gateId);
          }
        }
      }
      if (i + BATCH < systemIds.length) await this.sleep(DELAY_MS);
    }

    for (let i = 0; i < allGateIds.length; i += BATCH) {
      const batch = allGateIds.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(async (gateId) => {
          const resp = await fetch(
            `https://esi.evetech.net/latest/universe/stargates/${gateId}/?datasource=tranquility`,
          );
          if (!resp.ok) return null;
          const data: { stargate_id: number; name: string } = await resp.json();
          return { id: gateId, name: data.name };
        }),
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          this.stargateNames.set(r.value.id, r.value.name);
        }
      }
      if (i + BATCH < allGateIds.length) await this.sleep(DELAY_MS);
    }

    this.logger.log(
      `Loaded ${this.stargateIds.size} stargate IDs (${this.stargateNames.size} named) across Pochven`,
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  private isNearStargate(zkb: ZKBMetadata): boolean {
    return !!zkb.locationID && this.stargateIds.has(zkb.locationID);
  }

  @OnEvent('killmail.pochven')
  async handleKill(payload: KillmailPochvenPayload): Promise<void> {
    const { killmail, zkb } = payload;
    const systemId = killmail.solar_system_id;
    const systemName =
      POCHVEN_SYSTEM_BY_ID.get(systemId)?.name ?? `System ${systemId}`;
    const killTime = new Date(killmail.killmail_time).getTime();

    const attackerChars = this.extractAttackers(killmail);
    if (attackerChars.length < MIN_FLEET_SIZE) return;

    const attackerIds = new Set(attackerChars.map((a) => a.characterId));

    if (this.isKillmailProcessed(killmail.killmail_id)) return;

    const nearGate = this.isNearStargate(zkb);
    const locationId = zkb.locationID ?? null;

    let bestMatch: FleetGroup | null = null;
    let bestScore = 0;

    for (const group of this.groups.values()) {
      const existingIds = new Set(group.characters.keys());
      const jac = jaccard(attackerIds, existingIds);
      const ovlp = overlap(attackerIds, existingIds);
      const score = Math.max(jac, ovlp);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = group;
      }
    }

    const meetsThreshold = bestMatch && (
      bestScore >= JACCARD_THRESHOLD ||
      bestScore >= OVERLAP_THRESHOLD
    );

    if (bestMatch && meetsThreshold) {
      this.mergeIntoGroup(bestMatch, attackerChars, systemId, systemName, killTime, killmail.killmail_id, nearGate, locationId);
    } else {
      this.createGroup(attackerChars, systemId, systemName, killTime, killmail.killmail_id, nearGate, locationId);
    }
  }

  @Cron('*/2 * * * *')
  expireInactive(): void {
    const cutoff = Date.now() - EXPIRE_MS;
    for (const [id, group] of this.groups.entries()) {
      if (group.lastKillAt < cutoff) {
        this.groups.delete(id);
        this.logger.log(`Expired fleet group ${id} (${group.killCount} kills)`);
      }
    }
  }

  getActiveGroups(): FleetGroupResponse[] {
    return Array.from(this.groups.values())
      .filter((g) => g.characters.size >= MIN_FLEET_SIZE)
      .map((g) => this.toResponse(g))
      .filter((r): r is FleetGroupResponse => r !== null);
  }

  getActiveCamps(): FleetGroupResponse[] {
    return this.getActiveGroups().filter((g) => g.type === 'camp');
  }

  getActiveRoams(): FleetGroupResponse[] {
    return this.getActiveGroups().filter((g) => g.type === 'roam');
  }

  private extractAttackers(killmail: ESIKillmail): CharacterInfo[] {
    const chars: CharacterInfo[] = [];
    for (const a of killmail.attackers) {
      if (!a.character_id) continue;
      chars.push({
        characterId: a.character_id,
        corporationId: a.corporation_id,
        allianceId: a.alliance_id,
        shipTypeId: a.ship_type_id,
      });
    }
    return chars;
  }

  private isKillmailProcessed(killmailId: number): boolean {
    for (const group of this.groups.values()) {
      if (group.killmailIds.has(killmailId)) return true;
    }
    return false;
  }

  private mergeIntoGroup(
    group: FleetGroup,
    attackers: CharacterInfo[],
    systemId: number,
    systemName: string,
    killTime: number,
    killmailId: number,
    nearGate: boolean,
    locationId: number | null,
  ): void {
    for (const a of attackers) {
      group.characters.set(a.characterId, a);
      if (a.shipTypeId) group.shipTypes.add(a.shipTypeId);
    }

    if (group.currentSystemId !== systemId) {
      group.systemHistory.push({ systemId, systemName, timestamp: killTime });
      group.currentSystemId = systemId;
    }

    group.killCount++;

    if (nearGate && group.anchorGateId === null) {
      group.anchorGateId = locationId;
    }

    if (group.anchorGateId !== null && locationId === group.anchorGateId) {
      group.anchorKills++;
    } else {
      group.nonAnchorKills++;
    }

    group.lastKillAt = Math.max(group.lastKillAt, killTime);
    group.killmailIds.add(killmailId);

    const type = this.classifyGroup(group);
    this.emitGroupEvent(group, type, systemName);
    this.logger.log(
      `Merged kill into ${type ?? 'unclassified'} group ${group.id}: ${group.characters.size} chars, ${group.killCount} kills in ${systemName}`,
    );
  }

  private createGroup(
    attackers: CharacterInfo[],
    systemId: number,
    systemName: string,
    killTime: number,
    killmailId: number,
    nearGate: boolean,
    locationId: number | null,
  ): void {
    const id = randomUUID();
    const chars = new Map<number, CharacterInfo>();
    const ships = new Set<number>();
    for (const a of attackers) {
      chars.set(a.characterId, a);
      if (a.shipTypeId) ships.add(a.shipTypeId);
    }

    const group: FleetGroup = {
      id,
      characters: chars,
      shipTypes: ships,
      systemHistory: [{ systemId, systemName, timestamp: killTime }],
      currentSystemId: systemId,
      killCount: 1,
      anchorGateId: nearGate ? locationId : null,
      anchorKills: nearGate ? 1 : 0,
      nonAnchorKills: nearGate ? 0 : 1,
      firstSeenAt: killTime,
      lastKillAt: killTime,
      killmailIds: new Set([killmailId]),
    };

    this.groups.set(id, group);

    const type = this.classifyGroup(group);
    this.emitGroupEvent(group, type, systemName);
    this.logger.log(
      `New ${type ?? 'unclassified'} group ${id}: ${chars.size} chars in ${systemName}`,
    );
  }

  private emitGroupEvent(group: FleetGroup, type: 'camp' | 'roam' | null, systemName: string): void {
    if (type === null) return;
    if (type === 'camp') {
      this.eventEmitter.emit('camp.detected', {
        camp: {
          id: group.id,
          systemId: group.currentSystemId,
          systemName,
          shipTypes: Array.from(group.shipTypes),
          killCount: group.killCount,
          detectedAt: new Date(group.firstSeenAt),
          lastKillAt: new Date(group.lastKillAt),
        },
      });
    } else {
      this.eventEmitter.emit('roam.tracked', {
        roam: {
          id: group.id,
          systemHistory: group.systemHistory,
          predictedNext: this.predictNextSystem(group),
          shipTypes: Array.from(group.shipTypes),
          lastKillAt: new Date(group.lastKillAt),
        },
      });
    }
  }

  /**
   * camp  = single system + anchored to a stargate + no kills elsewhere
   * roam  = 2+ unique systems
   * null  = single system, not a camp (fight detection handles these)
   */
  private classifyGroup(group: FleetGroup): 'camp' | 'roam' | null {
    const uniqueSystems = new Set(group.systemHistory.map((s) => s.systemId));
    if (uniqueSystems.size >= 2) return 'roam';
    if (group.anchorGateId !== null && group.nonAnchorKills === 0) return 'camp';
    return null;
  }

  private predictNextSystem(group: FleetGroup): string[] {
    if (group.systemHistory.length < 2) return [];
    const last = group.systemHistory[group.systemHistory.length - 1];

    const connected = this.getConnectedSystemNames(last.systemName);
    const visitedRecently = new Set(
      group.systemHistory.slice(-5).map((s) => s.systemName),
    );

    const candidates = connected.filter((n) => !visitedRecently.has(n));
    return candidates.length > 0 ? [candidates[0]] : connected.length > 0 ? [connected[0]] : [];
  }

  private getConnectedSystemNames(systemName: string): string[] {
    const connected: string[] = [];
    for (const [a, b] of POCHVEN_CONNECTIONS) {
      if (a === systemName) connected.push(b);
      if (b === systemName) connected.push(a);
    }
    return connected;
  }

  private toResponse(group: FleetGroup): FleetGroupResponse | null {
    const type = this.classifyGroup(group);
    if (type === null) return null;
    const lastEntry = group.systemHistory[group.systemHistory.length - 1];
    const gateName = group.anchorGateId != null
      ? (this.stargateNames.get(group.anchorGateId) ?? null)
      : null;
    return {
      id: group.id,
      type,
      currentSystemId: group.currentSystemId,
      systemName: lastEntry?.systemName ?? `System ${group.currentSystemId}`,
      anchorGateName: gateName,
      characters: Array.from(group.characters.values()),
      shipTypes: Array.from(group.shipTypes),
      systemHistory: group.systemHistory,
      killCount: group.killCount,
      firstSeenAt: new Date(group.firstSeenAt).toISOString(),
      lastKillAt: new Date(group.lastKillAt).toISOString(),
      predictedNext: type === 'roam' ? this.predictNextSystem(group) : [],
    };
  }
}

function jaccard(a: Set<number>, b: Set<number>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const v of a) {
    if (b.has(v)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function overlap(a: Set<number>, b: Set<number>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const v of a) {
    if (b.has(v)) intersection++;
  }
  return intersection / Math.min(a.size, b.size);
}
