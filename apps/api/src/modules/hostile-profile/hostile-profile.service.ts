import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import type { Knex } from 'knex';
import { KNEX_TOKEN } from '../../database/knex.provider';
import { AllianceConfig } from '../../config/alliance.config';
import type { ESIKillmail, ZKBMetadata } from '@monipoch/shared';

type EntityType = 'character' | 'corporation' | 'alliance';

export interface HostileProfileRow {
  id: number;
  entity_type: EntityType;
  entity_id: number;
  entity_name: string;
  total_kills: number;
  total_losses: number;
  total_isk_destroyed: number;
  total_isk_lost: number;
  threat_score: number;
  preferred_ship_types: Record<number, number> | null;
  activity_by_hour: Record<number, number> | null;
  preferred_systems: Record<string, number> | null;
  avg_fleet_size: number | null;
  first_seen: Date | null;
  last_seen: Date | null;
  last_seen_system: string | null;
  last_updated: Date;
}

interface KillmailPochvenPayload {
  killmail: ESIKillmail;
  zkb: ZKBMetadata;
  systemName: string;
}

const NAME_CACHE_MAX = 5000;

@Injectable()
export class HostileProfileService {
  private readonly logger = new Logger(HostileProfileService.name);
  private readonly nameCache = new Map<number, string>();

  private pruneNameCache(): void {
    if (this.nameCache.size <= NAME_CACHE_MAX) return;
    const excess = this.nameCache.size - Math.floor(NAME_CACHE_MAX * 0.75);
    const iter = this.nameCache.keys();
    for (let i = 0; i < excess; i++) {
      const { value, done } = iter.next();
      if (done) break;
      this.nameCache.delete(value);
    }
  }

  constructor(
    @Inject(KNEX_TOKEN) private readonly db: Knex,
    private readonly allianceConfig: AllianceConfig,
  ) {}

  private async resolveNames(ids: number[]): Promise<Map<number, string>> {
    const result = new Map<number, string>();
    const missing = ids.filter((id) => {
      if (id <= 0) return false;
      const cached = this.nameCache.get(id);
      if (cached) { result.set(id, cached); return false; }
      return true;
    });
    if (missing.length === 0) return result;
    const CHUNK = 80;

    for (let i = 0; i < missing.length; i += CHUNK) {
      if (i > 0) await new Promise((r) => setTimeout(r, 1000));
      const chunk = missing.slice(i, i + CHUNK);
      try {
        const resp = await fetch(
          'https://esi.evetech.net/latest/universe/names/?datasource=tranquility',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(chunk),
          },
        );
        if (resp.status === 429 || resp.status === 420) {
          const retryAfter = parseInt(resp.headers.get('Retry-After') ?? '60', 10);
          this.logger.warn(`ESI rate limited, waiting ${retryAfter}s...`);
          await new Promise((r) => setTimeout(r, retryAfter * 1000));
          i -= CHUNK;
          continue;
        }
        if (resp.ok) {
          const data: { id: number; name: string }[] = await resp.json();
          for (const entry of data) {
            this.nameCache.set(entry.id, entry.name);
            result.set(entry.id, entry.name);
          }
          this.pruneNameCache();
        }
      } catch {
        this.logger.warn(`ESI /universe/names/ failed for chunk of ${chunk.length} IDs`);
      }
    }
    return result;
  }

  private async resolveName(entityType: EntityType, entityId: number): Promise<string> {
    const names = await this.resolveNames([entityId]);
    return names.get(entityId) ?? `${entityType.charAt(0).toUpperCase() + entityType.slice(1)} ${entityId}`;
  }

  @OnEvent('killmail.pochven')
  async handleKillmail(payload: KillmailPochvenPayload): Promise<void> {
    const { killmail, zkb, systemName } = payload;
    const killTime = new Date(killmail.killmail_time);
    const utcHour = killTime.getUTCHours();
    const solarSystemId = killmail.solar_system_id;
    const iskValue = Math.round(zkb.totalValue ?? 0);

    const hostileAttackers = killmail.attackers.filter((a) =>
      this.allianceConfig.isHostile(a.alliance_id),
    );
    const victimAllianceId = killmail.victim.alliance_id;
    const isVictimHostile = this.allianceConfig.isHostile(victimAllianceId);

    const idsToResolve = new Set<number>();
    for (const a of hostileAttackers) {
      if (a.character_id) idsToResolve.add(a.character_id);
      if (a.alliance_id) idsToResolve.add(a.alliance_id);
    }
    if (isVictimHostile) {
      if (killmail.victim.character_id) idsToResolve.add(killmail.victim.character_id);
      if (victimAllianceId) idsToResolve.add(victimAllianceId);
    }
    const names = await this.resolveNames([...idsToResolve]);

    for (const attacker of hostileAttackers) {
      if (attacker.character_id) {
        await this.upsertAttackerProfile(
          'character',
          attacker.character_id,
          names.get(attacker.character_id) ?? `Character ${attacker.character_id}`,
          attacker.ship_type_id,
          solarSystemId,
          systemName,
          killTime,
          iskValue,
          hostileAttackers.length,
        );
      }
      if (attacker.alliance_id) {
        await this.upsertAttackerProfile(
          'alliance',
          attacker.alliance_id,
          names.get(attacker.alliance_id) ?? `Alliance ${attacker.alliance_id}`,
          attacker.ship_type_id,
          solarSystemId,
          systemName,
          killTime,
          iskValue,
          hostileAttackers.length,
        );
      }
    }

    if (isVictimHostile) {
      if (killmail.victim.character_id) {
        await this.upsertVictimProfile(
          'character',
          killmail.victim.character_id,
          names.get(killmail.victim.character_id) ?? `Character ${killmail.victim.character_id}`,
          solarSystemId,
          systemName,
          killTime,
          iskValue,
        );
      }
      if (victimAllianceId) {
        await this.upsertVictimProfile(
          'alliance',
          victimAllianceId,
          names.get(victimAllianceId) ?? `Alliance ${victimAllianceId}`,
          solarSystemId,
          systemName,
          killTime,
          iskValue,
        );
      }
    }
  }

  private async upsertAttackerProfile(
    entityType: EntityType,
    entityId: number,
    entityName: string,
    shipTypeId: number | undefined,
    solarSystemId: number,
    systemName: string,
    killTime: Date,
    iskValue: number,
    fleetSize: number,
  ): Promise<void> {
    const existing = await this.db<HostileProfileRow>('hostile_profiles')
      .where({ entity_type: entityType, entity_id: entityId })
      .first();

    const preferredShipTypes: Record<number, number> = {
      ...(existing?.preferred_ship_types ?? {}),
    };
    if (shipTypeId) {
      preferredShipTypes[shipTypeId] = (preferredShipTypes[shipTypeId] ?? 0) + 1;
    }

    const activityByHour: Record<number, number> = {
      ...(existing?.activity_by_hour ?? {}),
    };
    activityByHour[killTime.getUTCHours()] =
      (activityByHour[killTime.getUTCHours()] ?? 0) + 1;

    const preferredSystems: Record<string, number> = {
      ...(existing?.preferred_systems ?? {}),
    };
    preferredSystems[systemName] = (preferredSystems[systemName] ?? 0) + 1;

    const newTotalKills = (existing?.total_kills ?? 0) + 1;
    const newTotalIskDestroyed =
      (Number(existing?.total_isk_destroyed ?? 0) || 0) + iskValue;
    const oldAvgFleet = existing?.avg_fleet_size ?? 0;
    const newAvgFleetSize =
      oldAvgFleet === 0
        ? fleetSize
        : (oldAvgFleet * (newTotalKills - 1) + fleetSize) / newTotalKills;

    if (existing) {
      await this.db('hostile_profiles')
        .where({ entity_type: entityType, entity_id: entityId })
        .update({
          entity_name: entityName,
          total_kills: newTotalKills,
          total_isk_destroyed: newTotalIskDestroyed,
          preferred_ship_types: JSON.stringify(preferredShipTypes),
          activity_by_hour: JSON.stringify(activityByHour),
          preferred_systems: JSON.stringify(preferredSystems),
          avg_fleet_size: Math.round(newAvgFleetSize * 100) / 100,
          first_seen: existing.first_seen,
          last_seen: killTime,
          last_seen_system: systemName,
          last_updated: new Date(),
        });
    } else {
      await this.db('hostile_profiles')
        .insert({
          entity_type: entityType,
          entity_id: entityId,
          entity_name: entityName,
          total_kills: newTotalKills,
          total_losses: 0,
          total_isk_destroyed: newTotalIskDestroyed,
          total_isk_lost: 0,
          threat_score: 0,
          preferred_ship_types: JSON.stringify(preferredShipTypes),
          activity_by_hour: JSON.stringify(activityByHour),
          preferred_systems: JSON.stringify(preferredSystems),
          avg_fleet_size: Math.round(newAvgFleetSize * 100) / 100,
          first_seen: killTime,
          last_seen: killTime,
          last_seen_system: systemName,
          last_updated: new Date(),
        })
        .onConflict(['entity_type', 'entity_id'])
        .merge({
          entity_name: entityName,
          total_kills: newTotalKills,
          total_isk_destroyed: newTotalIskDestroyed,
          preferred_ship_types: JSON.stringify(preferredShipTypes),
          activity_by_hour: JSON.stringify(activityByHour),
          preferred_systems: JSON.stringify(preferredSystems),
          avg_fleet_size: Math.round(newAvgFleetSize * 100) / 100,
          last_seen: killTime,
          last_seen_system: systemName,
          last_updated: new Date(),
        });
    }
  }

  private async upsertVictimProfile(
    entityType: EntityType,
    entityId: number,
    entityName: string,
    solarSystemId: number,
    systemName: string,
    killTime: Date,
    iskValue: number,
  ): Promise<void> {
    const existing = await this.db<HostileProfileRow>('hostile_profiles')
      .where({ entity_type: entityType, entity_id: entityId })
      .first();

    const newTotalLosses = (existing?.total_losses ?? 0) + 1;
    const newTotalIskLost =
      (Number(existing?.total_isk_lost ?? 0) || 0) + iskValue;

    if (existing) {
      await this.db('hostile_profiles')
        .where({ entity_type: entityType, entity_id: entityId })
        .update({
          entity_name: entityName,
          total_losses: newTotalLosses,
          total_isk_lost: newTotalIskLost,
          last_seen: killTime,
          last_seen_system: systemName,
          last_updated: new Date(),
        });
    } else {
      await this.db('hostile_profiles')
        .insert({
          entity_type: entityType,
          entity_id: entityId,
          entity_name: entityName,
          total_kills: 0,
          total_losses: newTotalLosses,
          total_isk_destroyed: 0,
          total_isk_lost: newTotalIskLost,
          threat_score: 0,
          preferred_ship_types: null,
          activity_by_hour: null,
          preferred_systems: JSON.stringify({ [systemName]: 1 }),
          avg_fleet_size: null,
          first_seen: killTime,
          last_seen: killTime,
          last_seen_system: systemName,
          last_updated: new Date(),
        })
        .onConflict(['entity_type', 'entity_id'])
        .merge({
          entity_name: entityName,
          total_losses: newTotalLosses,
          total_isk_lost: newTotalIskLost,
          last_seen: killTime,
          last_seen_system: systemName,
          last_updated: new Date(),
        });
    }
  }

  calculateThreatScore(profile: HostileProfileRow): number {
    const totalKills = profile.total_kills ?? 0;
    const iskDestroyedB = Number(profile.total_isk_destroyed ?? 0) / 1_000_000_000;
    const lastSeen = profile.last_seen
      ? new Date(profile.last_seen).getTime()
      : 0;
    const now = Date.now();
    const daysSinceLastSeen = (now - lastSeen) / (24 * 60 * 60 * 1000);
    const recencyFactor =
      daysSinceLastSeen >= 14 ? 0 : Math.max(0, 1 - daysSinceLastSeen / 14);
    const avgFleetSize = Math.min(profile.avg_fleet_size ?? 1, 50);

    const killScore = Math.min(Math.log10(totalKills + 1) / Math.log10(1000), 1) * 35;
    const iskScore = Math.min(Math.log10(iskDestroyedB * 10 + 1) / Math.log10(100), 1) * 25;
    const recencyScore = recencyFactor * 25;
    const fleetScore = Math.min(avgFleetSize / 30, 1) * 15;

    return Math.round(Math.min(killScore + iskScore + recencyScore + fleetScore, 100) * 10) / 10;
  }

  @Cron('0 */15 * * * *')
  async recalculateThreatScores(): Promise<void> {
    const profiles = await this.db<HostileProfileRow>('hostile_profiles').select('*');

    const unresolvedIds = profiles
      .filter((p) => /^(Character|Alliance|Corporation) \d+$/.test(p.entity_name))
      .map((p) => p.entity_id);
    const names = unresolvedIds.length > 0 ? await this.resolveNames(unresolvedIds) : new Map<number, string>();

    for (const profile of profiles) {
      const score = this.calculateThreatScore(profile);
      const resolvedName = names.get(profile.entity_id);
      const update: Record<string, unknown> = { threat_score: score, last_updated: new Date() };
      if (resolvedName) update.entity_name = resolvedName;
      await this.db('hostile_profiles').where({ id: profile.id }).update(update);
    }
    this.logger.debug(`Recalculated threat scores for ${profiles.length} profiles, resolved ${names.size} names`);
  }

  async getHostiles(
    page = 1,
    limit = 20,
    sortBy: 'threat_score' | 'last_seen' | 'total_kills' = 'threat_score',
    entityType?: EntityType,
  ): Promise<{ data: HostileProfileRow[]; total: number }> {
    let query = this.db<HostileProfileRow>('hostile_profiles');
    if (entityType) {
      query = query.where('entity_type', entityType);
    }
    const countQuery = query.clone();
    const countResult = await countQuery.count('* as count').first() as { count: string | number } | undefined;
    const total = countResult ? Number(countResult.count) : 0;

    const validSortColumns = ['threat_score', 'last_seen', 'total_kills'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'threat_score';
    const data = await query
      .orderBy(sortColumn, 'desc')
      .offset((page - 1) * limit)
      .limit(limit)
      .select('*');

    return { data, total: Number(total) };
  }

  async getActiveHostiles(hours = 2): Promise<HostileProfileRow[]> {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - hours);
    return this.db<HostileProfileRow>('hostile_profiles')
      .where('last_seen', '>=', cutoff)
      .orderBy('last_seen', 'desc')
      .select('*');
  }

  async getHostileDetail(
    entityId: number,
    entityType?: EntityType,
  ): Promise<HostileProfileRow | null> {
    let query = this.db<HostileProfileRow>('hostile_profiles').where(
      'entity_id',
      entityId,
    );
    if (entityType) {
      query = query.where('entity_type', entityType);
    }
    const profile = await query.first();
    return profile ?? null;
  }

  async getTopThreats(limit = 20): Promise<HostileProfileRow[]> {
    return this.db<HostileProfileRow>('hostile_profiles')
      .orderBy('threat_score', 'desc')
      .limit(limit)
      .select('*');
  }
}
