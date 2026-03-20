import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Knex } from 'knex';
import { KNEX_TOKEN } from '../../database/knex.provider';
import type { SessionUser, EveCharacter } from '@monipoch/shared';

interface SSOTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
}

interface SSOVerifyResponse {
  CharacterID: number;
  CharacterName: string;
  Scopes: string;
}

@Injectable()
export class AuthService {
  private clientId: string;
  private clientSecret: string;
  private callbackUrl: string;
  private allowedAllianceId: number;

  constructor(
    private config: ConfigService,
    private jwtService: JwtService,
    @Inject(KNEX_TOKEN) private db: Knex,
  ) {
    this.clientId = this.config.getOrThrow('eve.clientId');
    this.clientSecret = this.config.getOrThrow('eve.clientSecret');
    this.callbackUrl = this.config.getOrThrow('eve.callbackUrl');
    this.allowedAllianceId = this.config.getOrThrow('eve.allowedAllianceId');
  }

  getLoginUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      redirect_uri: this.callbackUrl,
      client_id: this.clientId,
      state,
      scope: '',
    });
    return `https://login.eveonline.com/v2/oauth/authorize/?${params}`;
  }

  async handleCallback(code: string): Promise<{ token: string; character: EveCharacter }> {
    const ssoTokens = await this.exchangeCode(code);
    const ssoVerify = await this.verifyToken(ssoTokens.access_token);

    const characterId = ssoVerify.CharacterID;
    const characterName = ssoVerify.CharacterName;

    const charInfo = await this.fetchESI(`/characters/${characterId}/`);
    const corporationId = charInfo.corporation_id;

    const corpInfo = await this.fetchESI(`/corporations/${corporationId}/`);
    const allianceId = corpInfo.alliance_id;

    if (!allianceId || allianceId !== this.allowedAllianceId) {
      throw new UnauthorizedException('ALLIANCE_DENIED');
    }

    const allianceInfo = await this.fetchESI(`/alliances/${allianceId}/`);

    await this.upsertAlliance(allianceId, allianceInfo.name, allianceInfo.ticker);
    await this.upsertCorporation(corporationId, corpInfo.name, corpInfo.ticker, allianceId);
    await this.upsertCharacter(characterId, characterName, corporationId, allianceId);
    const userId = await this.upsertUser(characterId, ssoTokens.refresh_token, ssoVerify.Scopes);

    const character: EveCharacter = {
      characterId,
      characterName,
      corporationId,
      corporationName: corpInfo.name,
      allianceId,
      allianceName: allianceInfo.name,
      portraitUrl: `https://images.evetech.net/characters/${characterId}/portrait?size=128`,
    };

    const payload: SessionUser = {
      userId,
      character,
      scopes: ssoVerify.Scopes ? ssoVerify.Scopes.split(' ') : [],
    };

    const token = this.jwtService.sign(payload);
    return { token, character };
  }

  async validateUser(payload: SessionUser): Promise<SessionUser> {
    const user = await this.db('users')
      .where('id', payload.userId)
      .first();

    if (!user) throw new UnauthorizedException('User not found');
    return payload;
  }

  private async exchangeCode(code: string): Promise<SSOTokenResponse> {
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const response = await fetch('https://login.eveonline.com/v2/oauth/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
      }),
    });

    if (!response.ok) {
      throw new UnauthorizedException('Failed to exchange SSO code');
    }

    return response.json() as Promise<SSOTokenResponse>;
  }

  private async verifyToken(accessToken: string): Promise<SSOVerifyResponse> {
    const parts = accessToken.split('.');
    if (parts.length !== 3) throw new UnauthorizedException('Invalid SSO token format');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    const sub: string = payload.sub ?? '';
    const characterId = parseInt(sub.split(':').pop() ?? '0', 10);
    return {
      CharacterID: characterId,
      CharacterName: payload.name,
      Scopes: payload.scp ? (Array.isArray(payload.scp) ? payload.scp.join(' ') : payload.scp) : '',
    };
  }

  private async fetchESI(path: string, retries = 2): Promise<any> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const response = await fetch(`https://esi.evetech.net/latest${path}?datasource=tranquility`, {
        headers: { 'User-Agent': 'Monipoch/1.0' },
      });
      if (response.status === 429 || response.status === 420) {
        const waitSec = parseInt(response.headers.get('Retry-After') ?? '60', 10);
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, waitSec * 1000));
          continue;
        }
      }
      if (!response.ok) throw new Error(`ESI ${path} returned ${response.status}`);
      return response.json();
    }
  }

  private async upsertAlliance(id: number, name: string, ticker: string) {
    await this.db('alliances')
      .insert({ alliance_id: id, name, ticker, last_updated: this.db.fn.now() })
      .onConflict('alliance_id')
      .merge();
  }

  private async upsertCorporation(id: number, name: string, ticker: string, allianceId: number) {
    await this.db('corporations')
      .insert({ corporation_id: id, name, ticker, alliance_id: allianceId, last_updated: this.db.fn.now() })
      .onConflict('corporation_id')
      .merge();
  }

  private async upsertCharacter(id: number, name: string, corpId: number, allianceId: number) {
    await this.db('characters')
      .insert({ character_id: id, name, corporation_id: corpId, alliance_id: allianceId, last_updated: this.db.fn.now() })
      .onConflict('character_id')
      .merge();
  }

  private async upsertUser(characterId: number, refreshToken: string, scopes: string): Promise<number> {
    const existing = await this.db('users').where('character_id', characterId).first();
    if (existing) {
      await this.db('users')
        .where('id', existing.id)
        .update({ refresh_token: refreshToken, scopes, last_login: this.db.fn.now() });
      return existing.id;
    }
    const [id] = await this.db('users').insert({
      character_id: characterId,
      refresh_token: refreshToken,
      scopes,
    });
    return id;
  }
}
