import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Knex } from 'knex';
import { KNEX_TOKEN } from '../../database/knex.provider';
import { POCHVEN_SYSTEM_BY_NAME } from '@monipoch/shared';

const SHIP_PATTERNS = [
  'sabre',
  'loki',
  'tengu',
  'cerberus',
  'eagle',
  'muninn',
  'ferox',
  'drake',
  'hurricane',
  'typhoon',
  'raven',
  'megathron',
  'dominix',
  'nightmare',
  'paladin',
  'golem',
  'vargur',
  'drekavac',
  'kikimora',
  'vedmak',
  'ikitursa',
  'nergal',
  'draugur',
  'rodiva',
  'zarmazd',
];

const SHIP_REGEX = new RegExp(
  `\\b(${SHIP_PATTERNS.join('|')})\\b`,
  'gi',
);

const PILOT_COUNT_REGEX = /\b(\d+)\s*(?:pilots?|ships?|in fleet|fleet of|sabres?|ships?)?\b|fleet of\s*(\d+)|(\d+)\s*\+\s*(?:sabre|loki|tengu|etc)/i;

export interface ParsedIntel {
  ships: string[];
  pilotCount: number | null;
  systemName: string | null;
  systemId: number | null;
}

export interface IntelReportRow {
  id: number;
  solar_system_id: number | null;
  raw_text: string;
  parsed_ships: string[];
  pilot_count: number | null;
  reported_by_user_id: number;
  reported_at: Date;
}

@Injectable()
export class IntelParserService {
  constructor(
    @Inject(KNEX_TOKEN) private readonly knex: Knex,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private parseIntelText(
    rawText: string,
    userId: number,
    systemId?: number,
  ): ParsedIntel {
    const ships = this.extractShips(rawText);
    const pilotCount = this.extractPilotCount(rawText);
    let systemName: string | null = null;
    let resolvedSystemId: number | null = systemId ?? null;

    if (!resolvedSystemId) {
      const matched = this.extractSystemFromText(rawText);
      if (matched) {
        systemName = matched.name;
        resolvedSystemId = matched.systemId;
      }
    } else {
      const sys = Array.from(POCHVEN_SYSTEM_BY_NAME.values()).find(
        (s) => s.systemId === resolvedSystemId,
      );
      if (sys) systemName = sys.name;
    }

    return {
      ships,
      pilotCount,
      systemName,
      systemId: resolvedSystemId,
    };
  }

  private extractShips(text: string): string[] {
    const matches = text.matchAll(SHIP_REGEX);
    const seen = new Set<string>();
    const result: string[] = [];
    for (const m of matches) {
      const name = m[1].toLowerCase();
      if (!seen.has(name)) {
        seen.add(name);
        result.push(name);
      }
    }
    return result;
  }

  private extractPilotCount(text: string): number | null {
    const m = text.match(PILOT_COUNT_REGEX);
    if (!m) return null;
    const n = parseInt(m[1] ?? m[2] ?? m[3] ?? '0', 10);
    return Number.isNaN(n) ? null : n;
  }

  private extractSystemFromText(text: string): { name: string; systemId: number } | null {
    const lower = text.toLowerCase();
    for (const [name, sys] of POCHVEN_SYSTEM_BY_NAME) {
      if (lower.includes(name)) {
        return { name: sys.name, systemId: sys.systemId };
      }
    }
    return null;
  }

  async parseIntelReport(
    rawText: string,
    userId: number,
    systemId?: number,
  ): Promise<IntelReportRow> {
    const parsed = this.parseIntelText(rawText, userId, systemId);
    const solarSystemId = parsed.systemId ?? null;

    const [id] = await this.knex('intel_reports').insert({
      solar_system_id: solarSystemId,
      raw_text: rawText,
      parsed_ships: JSON.stringify(parsed.ships),
      pilot_count: parsed.pilotCount,
      reported_by_user_id: userId,
    });

    const row = await this.knex<IntelReportRow>('intel_reports')
      .where('id', id)
      .first();
    if (!row) throw new Error('Failed to fetch created intel report');

    const report = {
      ...row,
      parsed_ships: parsed.ships,
    };

    this.eventEmitter.emit('intel.new', report);
    return report;
  }

  async getRecentReports(limit = 50): Promise<IntelReportRow[]> {
    const rows = await this.knex<IntelReportRow>('intel_reports')
      .select('*')
      .orderBy('reported_at', 'desc')
      .limit(limit);

    return rows.map((r) => ({
      ...r,
      parsed_ships: Array.isArray(r.parsed_ships)
        ? r.parsed_ships
        : (r.parsed_ships ? JSON.parse(r.parsed_ships as unknown as string) : []),
    }));
  }
}
