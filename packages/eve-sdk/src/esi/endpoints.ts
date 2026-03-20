import type { ESIClient, ESIRequestOptions, ESIResponse } from './client';
import {
  AlliancePublicSchema,
  CharacterAffiliationSchema,
  CharacterPublicSchema,
  CorporationPublicSchema,
  KillmailDetailSchema,
  SystemKillsSchema,
  type AlliancePublic,
  type CharacterAffiliation,
  type CharacterPublic,
  type CorporationPublic,
  type KillmailDetail,
  type SystemKills,
} from './schemas';

export class ESIEndpoints {
  constructor(private client: ESIClient) {}

  getCharacter(
    characterId: number,
    opts?: ESIRequestOptions,
  ): Promise<ESIResponse<CharacterPublic>> {
    return this.client.get(
      `/characters/${characterId}/`,
      CharacterPublicSchema,
      opts,
    );
  }

  getCorporation(
    corporationId: number,
    opts?: ESIRequestOptions,
  ): Promise<ESIResponse<CorporationPublic>> {
    return this.client.get(
      `/corporations/${corporationId}/`,
      CorporationPublicSchema,
      opts,
    );
  }

  getAlliance(
    allianceId: number,
    opts?: ESIRequestOptions,
  ): Promise<ESIResponse<AlliancePublic>> {
    return this.client.get(
      `/alliances/${allianceId}/`,
      AlliancePublicSchema,
      opts,
    );
  }

  postCharacterAffiliations(
    characterIds: number[],
    opts?: ESIRequestOptions,
  ): Promise<ESIResponse<CharacterAffiliation>> {
    return this.client.post(
      '/characters/affiliation/',
      characterIds,
      CharacterAffiliationSchema,
      opts,
    );
  }

  getSystemKills(
    opts?: ESIRequestOptions,
  ): Promise<ESIResponse<SystemKills>> {
    return this.client.get(
      '/universe/system_kills/',
      SystemKillsSchema,
      opts,
    );
  }

  getKillmailDetail(
    killmailId: number,
    killmailHash: string,
    opts?: ESIRequestOptions,
  ): Promise<ESIResponse<KillmailDetail>> {
    return this.client.get(
      `/killmails/${killmailId}/${killmailHash}/`,
      KillmailDetailSchema,
      opts,
    );
  }
}
