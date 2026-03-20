import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const ALLIANCE_CONFIG = 'ALLIANCE_CONFIG';

@Injectable()
export class AllianceConfig {
  readonly allianceId: number;

  constructor(config: ConfigService) {
    this.allianceId = config.getOrThrow<number>('eve.allowedAllianceId');
  }

  isOurAlliance(allianceId: number | undefined | null): boolean {
    return allianceId === this.allianceId;
  }

  isHostile(allianceId: number | undefined | null): boolean {
    if (!allianceId) return true;
    return allianceId !== this.allianceId;
  }
}
