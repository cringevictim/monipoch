import { Cron } from '@nestjs/schedule';
import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { KNEX_TOKEN } from '../../database/knex.provider';

export interface WormholeConnectionRow {
  id: number;
  from_system_id: number;
  to_system_id: number;
  wormhole_type: string;
  mass_status: string;
  estimated_eol: Date | null;
  reported_by_user_id: number;
  reported_at: Date;
  is_active: boolean;
}

@Injectable()
export class WormholeMapperService {
  constructor(@Inject(KNEX_TOKEN) private readonly knex: Knex) {}

  async reportConnection(
    fromSystemId: number,
    toSystemId: number,
    whType: string,
    userId: number,
    estimatedEol?: Date,
  ): Promise<WormholeConnectionRow> {
    const [id] = await this.knex('wormhole_connections').insert({
      from_system_id: fromSystemId,
      to_system_id: toSystemId,
      wormhole_type: whType,
      mass_status: 'fresh',
      estimated_eol: estimatedEol ?? null,
      reported_by_user_id: userId,
      is_active: true,
    });

    const row = await this.knex<WormholeConnectionRow>('wormhole_connections')
      .where('id', id)
      .first();
    if (!row) throw new Error('Failed to fetch created wormhole connection');
    return row;
  }

  async getActiveConnections(): Promise<(WormholeConnectionRow & { reporter_name?: string })[]> {
    const rows = await this.knex('wormhole_connections')
      .leftJoin('users', 'wormhole_connections.reported_by_user_id', 'users.id')
      .leftJoin('characters', 'users.character_id', 'characters.character_id')
      .where('wormhole_connections.is_active', true)
      .whereRaw('(wormhole_connections.estimated_eol IS NULL OR wormhole_connections.estimated_eol > NOW())')
      .orderBy('wormhole_connections.reported_at', 'desc')
      .select(
        'wormhole_connections.*',
        this.knex.raw('characters.name as reporter_name'),
      );
    return rows;
  }

  async canUserClose(id: number, userId: number): Promise<boolean> {
    const row = await this.knex('wormhole_connections')
      .where('id', id)
      .where('is_active', true)
      .first('reported_by_user_id');
    return !!row && row.reported_by_user_id === userId;
  }

  async closeConnection(id: number): Promise<void> {
    await this.knex('wormhole_connections').where('id', id).update({ is_active: false });
  }

  @Cron('*/5 * * * *')
  async autoCloseExpiredConnections(): Promise<void> {
    await this.knex('wormhole_connections')
      .where('is_active', true)
      .whereNotNull('estimated_eol')
      .whereRaw('estimated_eol < NOW()')
      .update({ is_active: false });
  }
}
