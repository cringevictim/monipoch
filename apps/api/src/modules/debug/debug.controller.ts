import { Controller, Get, Inject, NotFoundException, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Knex } from 'knex';
import type { Request } from 'express';
import { KNEX_TOKEN } from '../../database/knex.provider';
import { Public } from '../auth/public.decorator';
import type { SessionUser } from '@monipoch/shared';

@Public()
@Controller('api/debug')
export class DebugController {
  constructor(
    private config: ConfigService,
    @Inject(KNEX_TOKEN) private db: Knex,
  ) {}

  private assertDebug() {
    if (!this.config.get<boolean>('debug')) {
      throw new NotFoundException();
    }
  }

  @Get('info')
  async getDebugInfo(@Req() req: Request) {
    this.assertDebug();

    const user = (req as any).user as SessionUser | undefined;

    const [killmailCount] = await this.db('killmails').count('* as count');
    const [userCount] = await this.db('users').count('* as count');
    const [hostileCount] = await this.db('hostile_profiles').count('* as count');
    const [campCount] = await this.db('gate_camps').where('is_active', true).count('* as count');

    const latestKillmail = await this.db('killmails')
      .orderBy('killmail_time', 'desc')
      .first('killmail_id', 'solar_system_id', 'killmail_time', 'total_value');

    const allUsers = await this.db('users')
      .join('characters', 'users.character_id', 'characters.character_id')
      .leftJoin('corporations', 'characters.corporation_id', 'corporations.corporation_id')
      .leftJoin('alliances', 'characters.alliance_id', 'alliances.alliance_id')
      .select(
        'users.id as userId',
        'characters.character_id as characterId',
        'characters.name as characterName',
        'corporations.name as corporationName',
        'corporations.corporation_id as corporationId',
        'alliances.name as allianceName',
        'alliances.alliance_id as allianceId',
        'users.last_login',
      );

    const now = Date.now();
    const h1 = new Date(now - 1 * 3600_000);
    const h6 = new Date(now - 6 * 3600_000);
    const h24 = new Date(now - 24 * 3600_000);

    const [kills1h] = await this.db('killmails').where('killmail_time', '>=', h1).count('* as count');
    const [kills6h] = await this.db('killmails').where('killmail_time', '>=', h6).count('* as count');
    const [kills24h] = await this.db('killmails').where('killmail_time', '>=', h24).count('* as count');

    const oldestKillmail = await this.db('killmails')
      .orderBy('killmail_time', 'asc')
      .first('killmail_id', 'solar_system_id', 'killmail_time');

    const killsBySystem = await this.db('killmails')
      .where('killmail_time', '>=', h24)
      .select('solar_system_id')
      .count('* as count')
      .groupBy('solar_system_id')
      .orderBy('count', 'desc');

    return {
      currentUser: user
        ? {
            userId: user.userId,
            characterId: user.character.characterId,
            characterName: user.character.characterName,
            corporationId: user.character.corporationId,
            corporationName: user.character.corporationName,
            allianceId: user.character.allianceId,
            allianceName: user.character.allianceName,
          }
        : null,
      config: {
        allowedAllianceId: this.config.get<number>('eve.allowedAllianceId'),
        nodeEnv: this.config.get<string>('nodeEnv'),
        debug: true,
      },
      stats: {
        totalKillmails: Number(killmailCount.count),
        totalUsers: Number(userCount.count),
        totalHostileProfiles: Number(hostileCount.count),
        activeGateCamps: Number(campCount.count),
      },
      killsByTimeWindow: {
        last1h: Number(kills1h.count),
        last6h: Number(kills6h.count),
        last24h: Number(kills24h.count),
        total: Number(killmailCount.count),
      },
      killsBySystem24h: killsBySystem.map((r: any) => ({
        systemId: r.solar_system_id,
        kills: Number(r.count),
      })),
      latestKillmail,
      oldestKillmail,
      serverTime: new Date().toISOString(),
      registeredUsers: allUsers,
    };
  }
}
