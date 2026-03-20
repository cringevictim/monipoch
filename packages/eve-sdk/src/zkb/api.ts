import { z } from 'zod';

const ZKB_API_BASE = 'https://zkillboard.com/api';

export interface ZKBApiOptions {
  userAgent: string;
}

const ZKBKillSchema = z.object({
  killmail_id: z.number(),
  zkb: z.object({
    locationID: z.number().optional(),
    hash: z.string(),
    fittedValue: z.number(),
    droppedValue: z.number(),
    destroyedValue: z.number(),
    totalValue: z.number(),
    points: z.number(),
    npc: z.boolean(),
    solo: z.boolean(),
    awox: z.boolean(),
  }),
});

export type ZKBKill = z.infer<typeof ZKBKillSchema>;

export class ZKBApi {
  private userAgent: string;

  constructor(options: ZKBApiOptions) {
    this.userAgent = options.userAgent;
  }

  async getKills(filters: string): Promise<ZKBKill[]> {
    const url = `${ZKB_API_BASE}/${filters}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': this.userAgent,
        'Accept-Encoding': 'gzip',
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`zKB API ${url} returned ${response.status}`);
    }

    const json = await response.json();
    if (!Array.isArray(json)) return [];
    return z.array(ZKBKillSchema).parse(json);
  }

  getKillsByRegion(
    regionId: number,
    page = 1,
  ): Promise<ZKBKill[]> {
    return this.getKills(`kills/regionID/${regionId}/page/${page}/`);
  }

  getKillsBySystem(
    systemId: number,
    page = 1,
  ): Promise<ZKBKill[]> {
    return this.getKills(`kills/systemID/${systemId}/page/${page}/`);
  }

  getKillsByAlliance(
    allianceId: number,
    page = 1,
  ): Promise<ZKBKill[]> {
    return this.getKills(`allianceID/${allianceId}/page/${page}/`);
  }

  getKillsByCharacter(
    characterId: number,
    page = 1,
  ): Promise<ZKBKill[]> {
    return this.getKills(`characterID/${characterId}/page/${page}/`);
  }
}
