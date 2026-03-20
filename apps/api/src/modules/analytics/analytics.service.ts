import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import type { Knex } from 'knex';
import { KNEX_TOKEN } from '../../database/knex.provider';
import { POCHVEN_SYSTEM_BY_ID } from '@monipoch/shared';

export interface KillStatRow {
  date: string;
  kills: number;
  iskDestroyed: number;
}

export interface TopPilotRow {
  characterId: number;
  characterName: string;
  corporationId: number | null;
  corporationName: string | null;
  allianceId: number | null;
  allianceName: string | null;
  kills: number;
  finalBlows: number;
  iskDestroyed: number;
}

export interface ShipMetaRow {
  shipTypeId: number;
  shipName: string;
  count: number;
  iskDestroyed: number;
}

export interface ISKEfficiencyRow {
  totalDestroyed: number;
  totalLost: number;
  efficiency: number;
}

export interface FightSummaryRow {
  id: string;
  systemId: number;
  systemName: string;
  classification: string | null;
  totalKills: number;
  totalIskDestroyed: number;
  startedAt: string;
}

export interface TopLossRow {
  characterId: number;
  characterName: string;
  deaths: number;
  totalLost: number;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @Inject(KNEX_TOKEN) private readonly db: Knex,
    private readonly config: ConfigService,
  ) {}

  private async resolveNames(ids: number[]): Promise<Map<number, { name: string; category: string }>> {
    const map = new Map<number, { name: string; category: string }>();
    if (ids.length === 0) return map;
    const valid = ids.filter((id) => id > 0);
    const CHUNK = 80;

    for (let i = 0; i < valid.length; i += CHUNK) {
      if (i > 0) await new Promise((r) => setTimeout(r, 1000));
      const chunk = valid.slice(i, i + CHUNK);
      try {
        const resp = await fetch('https://esi.evetech.net/latest/universe/names/?datasource=tranquility', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(chunk),
        });
        if (resp.status === 429 || resp.status === 420) {
          const retryAfter = parseInt(resp.headers.get('Retry-After') ?? '60', 10);
          this.logger.warn(`ESI rate limited, waiting ${retryAfter}s...`);
          await new Promise((r) => setTimeout(r, retryAfter * 1000));
          i -= CHUNK;
          continue;
        }
        if (resp.ok) {
          const data: { id: number; name: string; category: string }[] = await resp.json();
          for (const entry of data) map.set(entry.id, { name: entry.name, category: entry.category });
        }
      } catch {
        this.logger.warn(`ESI /universe/names/ failed for chunk of ${chunk.length} IDs`);
      }
    }
    return map;
  }

  async getKillStats(days = 30, allianceId?: number): Promise<KillStatRow[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const query = this.db('killmails as km')
      .select(this.db.raw('DATE(km.killmail_time) as date'))
      .count('* as kills')
      .sum('km.total_value as iskDestroyed')
      .where('km.killmail_time', '>=', since)
      .where('km.is_npc', false);

    if (allianceId) {
      query.where(function () {
        this.where('km.victim_alliance_id', allianceId).orWhereExists(function () {
          this.select(1)
            .from('killmail_attackers as ka')
            .whereRaw('ka.killmail_id = km.killmail_id')
            .where('ka.alliance_id', allianceId);
        });
      });
    }

    query.groupBy(this.db.raw('DATE(km.killmail_time)')).orderBy('date', 'asc');

    const rows = await query;

    return rows.map((r: any) => ({
      date: String(r.date).split('T')[0],
      kills: Number(r.kills),
      iskDestroyed: Number(r.iskDestroyed ?? 0),
    }));
  }

  async getTopPilots(
    days = 30,
    limit = 20,
    allianceId?: number,
  ): Promise<TopPilotRow[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const sub = this.db('killmail_attackers as ka')
      .join('killmails as k', 'ka.killmail_id', 'k.killmail_id')
      .select(
        'ka.character_id as characterId',
        this.db.raw('MAX(ka.corporation_id) as corporationId'),
        this.db.raw('MAX(ka.alliance_id) as allianceId'),
        this.db.raw('COUNT(*) as kills'),
        this.db.raw('SUM(CASE WHEN ka.final_blow = 1 THEN 1 ELSE 0 END) as finalBlows'),
        this.db.raw('SUM(k.total_value) as iskDestroyed'),
      )
      .where('k.killmail_time', '>=', since)
      .whereNotNull('ka.character_id');

    if (allianceId) {
      sub.where('ka.alliance_id', allianceId);
    }

    sub.groupBy('ka.character_id');

    const rows = await this.db(sub.as('agg'))
      .select(
        'agg.characterId',
        'c.name as characterName',
        'agg.corporationId',
        'corp.name as corporationName',
        'agg.allianceId',
        'ally.name as allianceName',
        'agg.kills',
        'agg.finalBlows',
        'agg.iskDestroyed',
      )
      .leftJoin('characters as c', 'c.character_id', 'agg.characterId')
      .leftJoin('corporations as corp', 'corp.corporation_id', 'agg.corporationId')
      .leftJoin('alliances as ally', 'ally.alliance_id', 'agg.allianceId')
      .orderBy('agg.kills', 'desc')
      .limit(limit);

    const missingIds: number[] = [];
    for (const r of rows) {
      if (r.characterId && !r.characterName) missingIds.push(Number(r.characterId));
      if (r.corporationId && !r.corporationName) missingIds.push(Number(r.corporationId));
      if (r.allianceId && !r.allianceName) missingIds.push(Number(r.allianceId));
    }

    const resolved = missingIds.length > 0 ? await this.resolveNames([...new Set(missingIds)]) : new Map();

    return rows.map((r) => ({
      characterId: Number(r.characterId),
      characterName: r.characterName ?? resolved.get(Number(r.characterId))?.name ?? `Unknown (${r.characterId})`,
      corporationId: r.corporationId ? Number(r.corporationId) : null,
      corporationName: r.corporationName ?? resolved.get(Number(r.corporationId))?.name ?? null,
      allianceId: r.allianceId ? Number(r.allianceId) : null,
      allianceName: r.allianceName ?? resolved.get(Number(r.allianceId))?.name ?? null,
      kills: Number(r.kills),
      finalBlows: Number(r.finalBlows ?? 0),
      iskDestroyed: Number(r.iskDestroyed ?? 0),
    }));
  }

  async getShipMeta(days = 30, limit = 20, allianceId?: number): Promise<ShipMetaRow[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const participations = this.db('killmail_attackers as ka')
      .join('killmails as k', 'ka.killmail_id', 'k.killmail_id')
      .select('ka.ship_type_id', 'ka.killmail_id')
      .where('k.killmail_time', '>=', since)
      .where('k.is_npc', false)
      .whereNotNull('ka.ship_type_id')
      .whereNotNull('ka.character_id')
      .groupBy('ka.ship_type_id', 'ka.killmail_id');

    if (allianceId) {
      participations.where('ka.alliance_id', allianceId);
    }

    const rows = await this.db
      .from(participations.as('p'))
      .join('killmails as km', 'p.killmail_id', 'km.killmail_id')
      .select(
        'p.ship_type_id as shipTypeId',
        this.db.raw('COUNT(*) as count'),
        this.db.raw('SUM(km.total_value) as iskDestroyed'),
      )
      .groupBy('p.ship_type_id')
      .orderBy('count', 'desc')
      .limit(limit);

    const shipIds = rows.map((r) => Number(r.shipTypeId));
    const resolved = shipIds.length > 0 ? await this.resolveNames(shipIds) : new Map();

    return rows.map((r) => ({
      shipTypeId: Number(r.shipTypeId),
      shipName: resolved.get(Number(r.shipTypeId))?.name ?? `Type #${r.shipTypeId}`,
      count: Number(r.count),
      iskDestroyed: Number(r.iskDestroyed ?? 0),
    }));
  }

  async getISKEfficiency(days = 30, allianceIdOverride?: number): Promise<ISKEfficiencyRow> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const allianceId = allianceIdOverride;

    if (allianceId) {
      const destroyed = await this.db('killmails as k')
        .sum('k.total_value as sum')
        .whereExists(function () {
          this.select(1)
            .from('killmail_attackers as ka')
            .whereRaw('ka.killmail_id = k.killmail_id')
            .where('ka.alliance_id', allianceId);
        })
        .where('k.killmail_time', '>=', since)
        .where('k.is_npc', false)
        .first();
      const totalDestroyed = Number(destroyed?.sum ?? 0);

      const lost = await this.db('killmails')
        .sum('total_value as sum')
        .where('victim_alliance_id', allianceId)
        .where('killmail_time', '>=', since)
        .where('is_npc', false)
        .first();
      const totalLost = Number(lost?.sum ?? 0);

      const total = totalDestroyed + totalLost;
      const efficiency = total > 0 ? (totalDestroyed / total) * 100 : 0;
      return { totalDestroyed, totalLost, efficiency };
    }

    const allKills = await this.db('killmails')
      .sum('total_value as sum')
      .where('killmail_time', '>=', since)
      .where('is_npc', false)
      .first();
    const totalDestroyed = Number(allKills?.sum ?? 0);

    return { totalDestroyed, totalLost: 0, efficiency: 100 };
  }

  async getTopLosses(days = 30, limit = 5, allianceId?: number): Promise<TopLossRow[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const query = this.db('killmails as k')
      .select(
        'k.victim_character_id as characterId',
        this.db.raw('COUNT(*) as deaths'),
        this.db.raw('SUM(k.total_value) as totalLost'),
      )
      .where('k.killmail_time', '>=', since)
      .where('k.is_npc', false)
      .whereNotNull('k.victim_character_id')
      .groupBy('k.victim_character_id')
      .orderBy('totalLost', 'desc')
      .limit(limit);

    if (allianceId) {
      query.where('k.victim_alliance_id', allianceId);
    }

    const rows: any[] = await query;

    const charIds = rows.map((r) => Number(r.characterId)).filter(Boolean);
    const charRows = await this.db('characters')
      .select('character_id', 'name')
      .whereIn('character_id', charIds);
    const charMap = new Map(charRows.map((c: any) => [Number(c.character_id), c.name as string]));

    const missing = charIds.filter((id) => !charMap.has(id));
    const resolved = missing.length > 0 ? await this.resolveNames(missing) : new Map();

    return rows.map((r: any) => ({
      characterId: Number(r.characterId),
      characterName:
        charMap.get(Number(r.characterId)) ??
        resolved.get(Number(r.characterId))?.name ??
        `Pilot ${r.characterId}`,
      deaths: Number(r.deaths),
      totalLost: Number(r.totalLost),
    }));
  }

  async getFightSummaries(
    days = 30,
    limit = 20,
    allianceId?: number,
  ): Promise<FightSummaryRow[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const query = this.db('fights as f')
      .select(
        'f.id',
        'f.solar_system_id as systemId',
        'f.classification',
        'f.total_kills as totalKills',
        'f.total_isk_destroyed as totalIskDestroyed',
        'f.started_at as startedAt',
      )
      .where('f.started_at', '>=', since);

    if (allianceId) {
      query.whereExists(function () {
        this.select(1)
          .from('fight_killmails as fk')
          .join('killmail_attackers as ka', 'fk.killmail_id', 'ka.killmail_id')
          .whereRaw('fk.fight_id = f.id')
          .where('ka.alliance_id', allianceId);
      });
    }

    const rows = await query
      .orderBy('f.total_isk_destroyed', 'desc')
      .limit(limit);

    return rows.map((r: any) => {
      const sys = POCHVEN_SYSTEM_BY_ID.get(Number(r.systemId));
      return {
        id: String(r.id),
        systemId: Number(r.systemId),
        systemName: sys?.name ?? `Unknown (${r.systemId})`,
        classification: r.classification ?? null,
        totalKills: Number(r.totalKills ?? 0),
        totalIskDestroyed: Number(r.totalIskDestroyed ?? 0),
        startedAt: r.startedAt
          ? new Date(r.startedAt).toISOString()
          : new Date().toISOString(),
      };
    });
  }

  @Cron('0 2 * * *')
  async aggregateDailyStats(): Promise<void> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const tomorrow = new Date(yesterday);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const statDate = yesterday.toISOString().split('T')[0];

    const killmailAgg = await this.db('killmails')
      .select('solar_system_id as solar_system_id')
      .count('* as total_kills')
      .sum('total_value as total_isk_destroyed')
      .where('killmail_time', '>=', yesterday)
      .where('killmail_time', '<', tomorrow)
      .where('is_npc', false)
      .groupBy('solar_system_id');

    for (const row of killmailAgg) {
      const systemId = Number(row.solar_system_id);
      const totalKills = Number(row.total_kills ?? 0);
      const totalIskDestroyed = Number(row.total_isk_destroyed ?? 0);

      const [allianceRows] = await this.db.raw(
        `SELECT COUNT(DISTINCT aid) as cnt FROM (
          SELECT victim_alliance_id as aid FROM killmails WHERE solar_system_id = ? AND killmail_time >= ? AND killmail_time < ? AND is_npc = 0
          UNION
          SELECT ka.alliance_id as aid FROM killmail_attackers ka JOIN killmails k ON ka.killmail_id = k.killmail_id WHERE k.solar_system_id = ? AND k.killmail_time >= ? AND k.killmail_time < ? AND k.is_npc = 0
        ) u WHERE aid IS NOT NULL`,
        [
          systemId,
          yesterday,
          tomorrow,
          systemId,
          yesterday,
          tomorrow,
        ],
      );
      const uniqueAlliances = Number(allianceRows[0]?.cnt ?? 0);

      const [pilotRows] = await this.db.raw(
        `SELECT COUNT(DISTINCT pid) as cnt FROM (
          SELECT victim_character_id as pid FROM killmails WHERE solar_system_id = ? AND killmail_time >= ? AND killmail_time < ? AND is_npc = 0
          UNION
          SELECT ka.character_id as pid FROM killmail_attackers ka JOIN killmails k ON ka.killmail_id = k.killmail_id WHERE k.solar_system_id = ? AND k.killmail_time >= ? AND k.killmail_time < ? AND k.is_npc = 0
        ) u WHERE pid IS NOT NULL`,
        [
          systemId,
          yesterday,
          tomorrow,
          systemId,
          yesterday,
          tomorrow,
        ],
      );
      const uniquePilots = Number(pilotRows[0]?.cnt ?? 0);

      const fightCount = await this.db('fights')
        .where('solar_system_id', systemId)
        .whereRaw(
          '(started_at >= ? AND started_at < ?) OR (last_kill_at >= ? AND last_kill_at < ?)',
          [yesterday, tomorrow, yesterday, tomorrow],
        )
        .count('* as cnt')
        .first();

      const campCount = await this.db('gate_camps')
        .where('solar_system_id', systemId)
        .where('last_kill_at', '>=', yesterday)
        .where('last_kill_at', '<', tomorrow)
        .count('* as cnt')
        .first();

      await this.db('daily_system_stats')
        .insert({
          solar_system_id: systemId,
          stat_date: statDate,
          total_kills: totalKills,
          total_isk_destroyed: totalIskDestroyed,
          unique_alliances: uniqueAlliances,
          unique_pilots: uniquePilots,
          fight_count: Number(fightCount?.cnt ?? 0),
          camp_count: Number(campCount?.cnt ?? 0),
        })
        .onConflict(['solar_system_id', 'stat_date'])
        .merge([
          'total_kills',
          'total_isk_destroyed',
          'unique_alliances',
          'unique_pilots',
          'fight_count',
          'camp_count',
        ]);
    }
  }
}
