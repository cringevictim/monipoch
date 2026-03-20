import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Knex } from 'knex';
import { KNEX_TOKEN } from '../../database/knex.provider';
import type { ESIKillmail, ZKBMetadata } from '@monipoch/shared';

@Injectable()
export class KillmailService {
  private readonly logger = new Logger(KillmailService.name);
  private readonly allowedAllianceId: number;

  constructor(
    @Inject(KNEX_TOKEN) private db: Knex,
    private readonly config: ConfigService,
  ) {
    this.allowedAllianceId = this.config.get<number>('eve.allowedAllianceId') ?? 0;
  }

  async exists(killmailId: number): Promise<boolean> {
    const row = await this.db('killmails')
      .where('killmail_id', killmailId)
      .first();
    return !!row;
  }

  async insert(killmail: ESIKillmail, zkb: ZKBMetadata): Promise<void> {
    const trx = await this.db.transaction();

    try {
      await trx('killmails').insert({
        killmail_id: killmail.killmail_id,
        hash: zkb.hash,
        solar_system_id: killmail.solar_system_id,
        killmail_time: new Date(killmail.killmail_time),
        victim_character_id: killmail.victim.character_id ?? null,
        victim_corporation_id: killmail.victim.corporation_id ?? null,
        victim_alliance_id: killmail.victim.alliance_id ?? null,
        victim_ship_type_id: killmail.victim.ship_type_id,
        total_value: Math.round(zkb.totalValue),
        attacker_count: killmail.attackers.length,
        is_npc: zkb.npc,
        is_solo: zkb.solo,
      });

      if (killmail.attackers.length > 0) {
        const attackerRows = killmail.attackers.map((a) => ({
          killmail_id: killmail.killmail_id,
          character_id: a.character_id ?? null,
          corporation_id: a.corporation_id ?? null,
          alliance_id: a.alliance_id ?? null,
          ship_type_id: a.ship_type_id ?? null,
          weapon_type_id: a.weapon_type_id ?? null,
          damage_done: a.damage_done,
          final_blow: a.final_blow,
          faction_id: a.faction_id ?? null,
        }));

        await trx('killmail_attackers').insert(attackerRows);
      }

      await trx.commit();
    } catch (err: any) {
      await trx.rollback();
      if (err.code === 'ER_DUP_ENTRY') {
        this.logger.debug(`Duplicate killmail ${killmail.killmail_id}, skipping`);
        return;
      }
      throw err;
    }
  }

  async getRecentBySystem(
    systemId: number,
    hours: number = 24,
    limit: number = 100,
  ) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const fbSub = this.db('killmail_attackers')
      .select('killmail_id', 'character_id', 'corporation_id', 'alliance_id', 'ship_type_id')
      .where('final_blow', true)
      .as('fb');

    const query = this.db('killmails as km')
      .leftJoin('characters as vc', 'km.victim_character_id', 'vc.character_id')
      .leftJoin('corporations as vcorp', 'km.victim_corporation_id', 'vcorp.corporation_id')
      .leftJoin('alliances as va', 'km.victim_alliance_id', 'va.alliance_id')
      .leftJoin(fbSub, 'fb.killmail_id', 'km.killmail_id')
      .leftJoin('characters as fc', 'fb.character_id', 'fc.character_id')
      .leftJoin('corporations as fcorp', 'fb.corporation_id', 'fcorp.corporation_id')
      .leftJoin('alliances as fa', 'fb.alliance_id', 'fa.alliance_id')
      .select(
        'km.killmail_id',
        'km.solar_system_id',
        'km.killmail_time',
        'km.victim_character_id',
        'km.victim_corporation_id',
        'km.victim_alliance_id',
        'km.victim_ship_type_id',
        'km.total_value',
        'km.attacker_count',
        'km.is_npc',
        'km.is_solo',
        'vc.name as victim_name',
        'vcorp.name as victim_corp_name',
        'vcorp.ticker as victim_corp_ticker',
        'va.name as victim_alliance_name',
        'va.ticker as victim_alliance_ticker',
        'fb.character_id as fb_character_id',
        'fb.corporation_id as fb_corporation_id',
        'fb.alliance_id as fb_alliance_id',
        'fb.ship_type_id as fb_ship_type_id',
        'fc.name as fb_character_name',
        'fcorp.name as fb_corp_name',
        'fcorp.ticker as fb_corp_ticker',
        'fa.name as fb_alliance_name',
        'fa.ticker as fb_alliance_ticker',
      )
      .where('km.solar_system_id', systemId)
      .where('km.killmail_time', '>=', since)
      .orderBy('km.killmail_time', 'desc')
      .limit(limit);

    if (this.allowedAllianceId) {
      query.select(
        this.db.raw(
          `(km.victim_alliance_id = ?) as victim_is_alliance`,
          [this.allowedAllianceId],
        ),
        this.db.raw(
          `EXISTS(SELECT 1 FROM killmail_attackers WHERE killmail_id = km.killmail_id AND alliance_id = ?) as attacker_is_alliance`,
          [this.allowedAllianceId],
        ),
      );
    }

    const rows = await query;

    const missingIds = this.collectMissingEntityIds(rows);
    if (missingIds.length > 0) {
      const resolved = await this.resolveNames(missingIds);
      this.applyResolvedNames(rows, resolved);
    }

    return rows;
  }

  private collectMissingEntityIds(rows: any[]): number[] {
    const ids = new Set<number>();
    for (const r of rows) {
      if (r.victim_character_id && !r.victim_name) ids.add(r.victim_character_id);
      if (r.victim_corporation_id && !r.victim_corp_name) ids.add(r.victim_corporation_id);
      if (r.victim_alliance_id && !r.victim_alliance_name) ids.add(r.victim_alliance_id);
      if (r.fb_character_id && !r.fb_character_name) ids.add(r.fb_character_id);
      if (r.fb_corporation_id && !r.fb_corp_name) ids.add(r.fb_corporation_id);
      if (r.fb_alliance_id && !r.fb_alliance_name) ids.add(r.fb_alliance_id);
      if (r.fb_ship_type_id) ids.add(r.fb_ship_type_id);
      if (r.victim_ship_type_id) ids.add(r.victim_ship_type_id);
    }
    return Array.from(ids);
  }

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
          for (const entry of data) {
            map.set(entry.id, { name: entry.name, category: entry.category });
          }
          this.cacheResolvedNames(data).catch(() => {});
        } else {
          this.logger.warn(`ESI /universe/names/ returned ${resp.status} for chunk of ${chunk.length} IDs, skipping`);
        }
      } catch (err) {
        this.logger.warn(`ESI /universe/names/ failed for chunk of ${chunk.length} IDs`);
      }
    }
    return map;
  }

  private async cacheResolvedNames(entries: { id: number; name: string; category: string }[]): Promise<void> {
    for (const entry of entries) {
      try {
        if (entry.category === 'character') {
          await this.db('characters')
            .insert({ character_id: entry.id, name: entry.name })
            .onConflict('character_id')
            .merge({ name: entry.name, last_updated: this.db.fn.now() });
        } else if (entry.category === 'corporation') {
          await this.db('corporations')
            .insert({ corporation_id: entry.id, name: entry.name, ticker: '' })
            .onConflict('corporation_id')
            .merge({ name: entry.name, last_updated: this.db.fn.now() });
        } else if (entry.category === 'alliance') {
          await this.db('alliances')
            .insert({ alliance_id: entry.id, name: entry.name, ticker: '' })
            .onConflict('alliance_id')
            .merge({ name: entry.name, last_updated: this.db.fn.now() });
        }
      } catch {
        // best-effort caching
      }
    }
  }

  private applyResolvedNames(rows: any[], resolved: Map<number, { name: string; category: string }>): void {
    for (const r of rows) {
      if (r.victim_character_id && !r.victim_name) {
        r.victim_name = resolved.get(r.victim_character_id)?.name ?? null;
      }
      if (r.victim_corporation_id && !r.victim_corp_name) {
        const corp = resolved.get(r.victim_corporation_id);
        if (corp) r.victim_corp_name = corp.name;
      }
      if (r.victim_alliance_id && !r.victim_alliance_name) {
        const ally = resolved.get(r.victim_alliance_id);
        if (ally) r.victim_alliance_name = ally.name;
      }
      if (r.fb_character_id && !r.fb_character_name) {
        r.fb_character_name = resolved.get(r.fb_character_id)?.name ?? null;
      }
      if (r.fb_corporation_id && !r.fb_corp_name) {
        const corp = resolved.get(r.fb_corporation_id);
        if (corp) r.fb_corp_name = corp.name;
      }
      if (r.fb_alliance_id && !r.fb_alliance_name) {
        const ally = resolved.get(r.fb_alliance_id);
        if (ally) r.fb_alliance_name = ally.name;
      }
      if (r.fb_ship_type_id && !r.fb_ship_name) {
        const ship = resolved.get(r.fb_ship_type_id);
        if (ship) r.fb_ship_name = ship.name;
      }
      if (r.victim_ship_type_id && !r.victim_ship_name) {
        const ship = resolved.get(r.victim_ship_type_id);
        if (ship) r.victim_ship_name = ship.name;
      }
    }
  }

  async getHeatmapData(): Promise<
    Record<number, { kills1h: number; kills6h: number; kills24h: number }>
  > {
    const now = Date.now();
    const h1 = new Date(now - 1 * 60 * 60 * 1000);
    const h6 = new Date(now - 6 * 60 * 60 * 1000);
    const h24 = new Date(now - 24 * 60 * 60 * 1000);

    const rows = await this.db('killmails')
      .select('solar_system_id')
      .select(
        this.db.raw('SUM(CASE WHEN killmail_time >= ? THEN 1 ELSE 0 END) as kills1h', [h1]),
      )
      .select(
        this.db.raw('SUM(CASE WHEN killmail_time >= ? THEN 1 ELSE 0 END) as kills6h', [h6]),
      )
      .select(
        this.db.raw('SUM(CASE WHEN killmail_time >= ? THEN 1 ELSE 0 END) as kills24h', [h24]),
      )
      .where('killmail_time', '>=', h24)
      .groupBy('solar_system_id');

    const result: Record<number, { kills1h: number; kills6h: number; kills24h: number }> = {};
    for (const row of rows) {
      result[row.solar_system_id] = {
        kills1h: Number(row.kills1h),
        kills6h: Number(row.kills6h),
        kills24h: Number(row.kills24h),
      };
    }
    return result;
  }
}
