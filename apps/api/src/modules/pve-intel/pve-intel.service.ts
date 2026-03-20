import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Knex } from 'knex';
import { ESIClient, ESIEndpoints } from '@monipoch/eve-sdk';
import {
  KNEX_TOKEN,
} from '../../database/knex.provider';
import {
  POCHVEN_SYSTEM_IDS,
  POCHVEN_SYSTEMS,
  POCHVEN_SYSTEM_BY_ID,
} from '@monipoch/shared';

export interface SystemNPCKillsRow {
  id: number;
  solar_system_id: number;
  npc_kills: number;
  ship_kills: number;
  pod_kills: number;
  snapshot_time: Date;
}

export interface SafeSystemRanking {
  systemId: number;
  systemName: string;
  score: number;
  pvpKills6h: number;
  npcKills: number;
  hasActiveCamp: boolean;
}

export interface ActivityTrendRow {
  solar_system_id: number;
  npc_kills: number;
  ship_kills: number;
  pod_kills: number;
  snapshot_time: Date;
}

export interface FlashpointSystem {
  systemId: number;
  systemName: string;
  latestNpcKills: number;
  sevenDayAverage: number;
  ratio: number;
}

@Injectable()
export class PVEIntelService {
  private readonly logger = new Logger(PVEIntelService.name);
  private readonly esi: ESIEndpoints;

  constructor(
    @Inject(KNEX_TOKEN)
    private readonly knex: Knex,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.esi = new ESIEndpoints(new ESIClient('monipoch-pve/1.0'));
  }

  @Cron('5 * * * *')
  async fetchAndStoreSystemKills(): Promise<void> {
    try {
      const response = await this.esi.getSystemKills();
      if (response.cached || !response.data) return;

      const pochvenRows = response.data.filter((row) =>
        POCHVEN_SYSTEM_IDS.has(row.system_id),
      );

      const snapshotTime = new Date();
      const inserts = pochvenRows.map((row) => ({
        solar_system_id: row.system_id,
        npc_kills: row.npc_kills,
        ship_kills: row.ship_kills,
        pod_kills: row.pod_kills,
        snapshot_time: snapshotTime,
      }));

      if (inserts.length > 0) {
        await this.knex('system_npc_kills').insert(inserts);
      }
    } catch (err) {
      this.logger.error('Failed to fetch/store system kills', err);
    }
  }

  async getLatestNPCKills(): Promise<SystemNPCKillsRow[]> {
    const subquery = this.knex('system_npc_kills')
      .select('solar_system_id')
      .max('id as max_id')
      .whereIn('solar_system_id', Array.from(POCHVEN_SYSTEM_IDS))
      .groupBy('solar_system_id')
      .as('latest');

    const rows = await this.knex('system_npc_kills as snk')
      .select('snk.id', 'snk.solar_system_id', 'snk.npc_kills', 'snk.ship_kills', 'snk.pod_kills', 'snk.snapshot_time')
      .innerJoin(subquery, function () {
        this.on('snk.solar_system_id', '=', 'latest.solar_system_id').andOn(
          'snk.id',
          '=',
          'latest.max_id',
        );
      })
      .orderBy('snk.solar_system_id');

    return rows as SystemNPCKillsRow[];
  }

  async getSafeSystemRanking(): Promise<SafeSystemRanking[]> {
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

    const latestKills = await this.getLatestNPCKills();
    const latestBySystem = new Map(
      latestKills.map((r) => [r.solar_system_id, r]),
    );

    const pvpCounts = await this.knex('killmails')
      .select('solar_system_id')
      .count('* as count')
      .whereIn('solar_system_id', Array.from(POCHVEN_SYSTEM_IDS))
      .where('killmail_time', '>', sixHoursAgo)
      .where('is_npc', false)
      .groupBy('solar_system_id');

    const pvpBySystem = new Map(
      pvpCounts.map((r) => [r.solar_system_id, Number(r.count)]),
    );

    const activeCamps = await this.knex('gate_camps')
      .select('solar_system_id')
      .where('is_active', true)
      .whereIn('solar_system_id', Array.from(POCHVEN_SYSTEM_IDS));

    const campedSystems = new Set(activeCamps.map((r) => r.solar_system_id));

    const results: SafeSystemRanking[] = POCHVEN_SYSTEMS.map((sys) => {
      const pvpKills6h = pvpBySystem.get(sys.systemId) ?? 0;
      const latest = latestBySystem.get(sys.systemId);
      const npcKills = latest?.npc_kills ?? 0;
      const hasActiveCamp = campedSystems.has(sys.systemId);

      let score = 100;
      score -= pvpKills6h * 10;
      score -= Math.floor((npcKills / 100) * 2);
      if (hasActiveCamp) score -= 30;
      score = Math.max(0, Math.min(100, score));

      return {
        systemId: sys.systemId,
        systemName: sys.name,
        score,
        pvpKills6h,
        npcKills,
        hasActiveCamp,
      };
    });

    return results.sort((a, b) => b.score - a.score);
  }

  async getActivityTrends(
    systemId: number,
    days = 7,
  ): Promise<ActivityTrendRow[]> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await this.knex('system_npc_kills')
      .select('solar_system_id', 'npc_kills', 'ship_kills', 'pod_kills', 'snapshot_time')
      .where('solar_system_id', systemId)
      .where('snapshot_time', '>=', cutoff)
      .orderBy('snapshot_time', 'asc');

    return rows as ActivityTrendRow[];
  }

  async detectFlashpoints(): Promise<FlashpointSystem[]> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const latestKills = await this.getLatestNPCKills();
    const latestBySystem = new Map(
      latestKills.map((r) => [r.solar_system_id, r]),
    );

    const averages = await this.knex('system_npc_kills')
      .select('solar_system_id')
      .avg('npc_kills as avg_npc_kills')
      .where('snapshot_time', '>=', sevenDaysAgo)
      .whereIn('solar_system_id', Array.from(POCHVEN_SYSTEM_IDS))
      .groupBy('solar_system_id');

    const avgBySystem = new Map(
      averages.map((r) => [r.solar_system_id, Number(r.avg_npc_kills)]),
    );

    const flashpoints: FlashpointSystem[] = [];

    for (const sys of POCHVEN_SYSTEMS) {
      const latest = latestBySystem.get(sys.systemId);
      const latestNpcKills = latest?.npc_kills ?? 0;
      const sevenDayAverage = avgBySystem.get(sys.systemId) ?? 0;

      if (sevenDayAverage <= 0) continue;
      const ratio = latestNpcKills / sevenDayAverage;
      if (ratio > 2) {
        flashpoints.push({
          systemId: sys.systemId,
          systemName: sys.name,
          latestNpcKills,
          sevenDayAverage,
          ratio,
        });
      }
    }

    return flashpoints.sort((a, b) => b.ratio - a.ratio);
  }

  @OnEvent('killmail.pochven')
  handleKillmailPochven(payload: {
    killmail: { solar_system_id: number };
    zkb: { npc: boolean };
  }): void {
    if (payload.zkb.npc) {
      const sys = POCHVEN_SYSTEM_BY_ID.get(payload.killmail.solar_system_id);
      this.logger.log(
        `NPC kill in ${sys?.name ?? payload.killmail.solar_system_id} (finer granularity)`,
      );
    }
  }
}
