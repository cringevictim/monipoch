import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import type { Knex } from 'knex';
import { KNEX_TOKEN } from '../../database/knex.provider';
import { POCHVEN_SYSTEM_BY_ID } from '@monipoch/shared';
import type { ESIKillmail, ZKBMetadata } from '@monipoch/shared';

const CAMP_WINDOW_MS = 15 * 60 * 1000;
const CAMP_INACTIVE_MS = 20 * 60 * 1000;
const CLEANUP_MS = 20 * 60 * 1000;

interface KillWindow {
  timestamp: number;
  attackerAllianceId: number | null;
  attackerCorpId: number | null;
  killmailId: number;
}

interface KillmailPochvenPayload {
  killmail: ESIKillmail;
  zkb: ZKBMetadata;
  systemName: string;
}

@Injectable()
export class GateCampService {
  private readonly logger = new Logger(GateCampService.name);
  private recentKills = new Map<number, KillWindow[]>();

  constructor(
    @Inject(KNEX_TOKEN) private db: Knex,
    private eventEmitter: EventEmitter2,
  ) {}

  @OnEvent('killmail.pochven')
  async handleKill(payload: KillmailPochvenPayload): Promise<void> {
    const { killmail, systemName: payloadSystemName } = payload;
    const systemName = payloadSystemName ?? POCHVEN_SYSTEM_BY_ID.get(killmail.solar_system_id)?.name ?? 'Unknown';
    const systemId = killmail.solar_system_id;
    const killTime = new Date(killmail.killmail_time).getTime();

    const dominant = this.getDominantAttacker(killmail);
    if (!dominant) return;

    const window: KillWindow = {
      timestamp: killTime,
      attackerAllianceId: dominant.alliance_id ?? null,
      attackerCorpId: dominant.corporation_id ?? null,
      killmailId: killmail.killmail_id,
    };

    const kills = this.recentKills.get(systemId) ?? [];
    kills.push(window);
    this.recentKills.set(systemId, kills);

    this.cleanupOldKills(systemId);

    const recentInWindow = kills.filter((k) => killTime - k.timestamp <= CAMP_WINDOW_MS);
    const byGroup = new Map<string, KillWindow[]>();
    for (const k of recentInWindow) {
      const key = k.attackerAllianceId != null ? `a:${k.attackerAllianceId}` : `c:${k.attackerCorpId}`;
      const group = byGroup.get(key) ?? [];
      group.push(k);
      byGroup.set(key, group);
    }

    for (const [, groupKills] of byGroup) {
      if (groupKills.length >= 3) {
        const first = groupKills[0];
        const attackerAllianceId = first.attackerAllianceId;
        const attackerCorpId = first.attackerCorpId;
        const shipTypeIds = this.collectShipTypes(killmail);
        if (shipTypeIds.length < 2) continue;
        const killCount = groupKills.length;

        const camp = await this.upsertCamp({
          solar_system_id: systemId,
          attacker_alliance_id: attackerAllianceId,
          attacker_corporation_id: attackerCorpId,
          attacker_entity_name: null,
          ship_type_ids: shipTypeIds,
          kill_count: killCount,
          detected_at: new Date(Math.min(...groupKills.map((k) => k.timestamp))),
          last_kill_at: new Date(killTime),
          is_active: true,
        });

        this.eventEmitter.emit('camp.detected', {
          camp: {
            id: camp.id,
            systemId,
            systemName,
            attackerName: null,
            shipTypes: shipTypeIds,
            killCount,
            detectedAt: new Date(Math.min(...groupKills.map((k) => k.timestamp))),
            lastKillAt: new Date(killTime),
          },
        });

        this.logger.log(`Gate camp detected in ${systemName}: ${killCount} kills`);
        break;
      }
    }
  }

  @Cron('*/2 * * * *')
  async markInactiveCamps(): Promise<void> {
    const cutoff = new Date(Date.now() - CAMP_INACTIVE_MS);
    const updated = await this.db('gate_camps')
      .where('is_active', true)
      .where('last_kill_at', '<', cutoff)
      .update({ is_active: false });

    if (updated > 0) {
      this.logger.log(`Marked ${updated} gate camp(s) inactive`);
    }
  }

  @Cron('*/2 * * * *')
  cleanupRecentKills(): void {
    const cutoff = Date.now() - CLEANUP_MS;
    for (const [systemId, kills] of this.recentKills.entries()) {
      const filtered = kills.filter((k) => k.timestamp > cutoff);
      if (filtered.length === 0) {
        this.recentKills.delete(systemId);
      } else {
        this.recentKills.set(systemId, filtered);
      }
    }
  }

  async getActiveCamps(): Promise<
    Array<{
      id: number;
      solar_system_id: number;
      system_name: string;
      attacker_alliance_id: number | null;
      attacker_corporation_id: number | null;
      attacker_entity_name: string | null;
      ship_type_ids: number[] | null;
      kill_count: number;
      detected_at: Date;
      last_kill_at: Date;
      is_active: boolean;
    }>
  > {
    const rows = await this.db('gate_camps')
      .where('is_active', true)
      .orderBy('last_kill_at', 'desc');

    return rows.map((r) => ({
      ...r,
      system_name: POCHVEN_SYSTEM_BY_ID.get(r.solar_system_id)?.name ?? `System ${r.solar_system_id}`,
      ship_type_ids:
        r.ship_type_ids == null
          ? null
          : typeof r.ship_type_ids === 'string'
            ? JSON.parse(r.ship_type_ids)
            : r.ship_type_ids,
    }));
  }

  private getDominantAttacker(killmail: ESIKillmail): { alliance_id?: number; corporation_id?: number; ship_type_id?: number } | null {
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

  private cleanupOldKills(systemId: number): void {
    const kills = this.recentKills.get(systemId);
    if (!kills) return;
    const cutoff = Date.now() - CAMP_WINDOW_MS;
    const filtered = kills.filter((k) => k.timestamp > cutoff);
    this.recentKills.set(systemId, filtered);
  }

  private async upsertCamp(data: {
    solar_system_id: number;
    attacker_alliance_id: number | null;
    attacker_corporation_id: number | null;
    attacker_entity_name: string | null;
    ship_type_ids: number[];
    kill_count: number;
    detected_at: Date;
    last_kill_at: Date;
    is_active: boolean;
  }): Promise<{ id: number }> {
    const existing = await this.db('gate_camps')
      .where('solar_system_id', data.solar_system_id)
      .where('is_active', true)
      .where('attacker_alliance_id', data.attacker_alliance_id ?? null)
      .where('attacker_corporation_id', data.attacker_corporation_id ?? null)
      .first();

    const row = {
      solar_system_id: data.solar_system_id,
      attacker_alliance_id: data.attacker_alliance_id,
      attacker_corporation_id: data.attacker_corporation_id,
      attacker_entity_name: data.attacker_entity_name,
      ship_type_ids: JSON.stringify(data.ship_type_ids),
      kill_count: data.kill_count,
      detected_at: data.detected_at,
      last_kill_at: data.last_kill_at,
      is_active: data.is_active,
    };

    if (existing) {
      await this.db('gate_camps').where('id', existing.id).update(row);
      return { id: existing.id };
    }

    const [insertId] = await this.db('gate_camps').insert(row);
    return { id: insertId as number };
  }
}
