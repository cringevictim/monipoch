import { Injectable } from '@nestjs/common';
import {
  POCHVEN_SYSTEMS,
  POCHVEN_CONNECTIONS,
  type PochvenSystem,
} from '@monipoch/shared';
import { KillmailService } from '../killmail/killmail.service';
import { FightDetectionService } from '../fight-detection/fight-detection.service';

@Injectable()
export class MapService {
  constructor(
    private killmailService: KillmailService,
    private fightDetectionService: FightDetectionService,
  ) {}

  getTopology(): {
    systems: PochvenSystem[];
    connections: [string, string][];
  } {
    return {
      systems: POCHVEN_SYSTEMS,
      connections: POCHVEN_CONNECTIONS,
    };
  }

  async getHeatmap() {
    return this.killmailService.getHeatmapData();
  }

  getActiveFights() {
    return this.fightDetectionService.getActiveFights();
  }

  async getSystemKills(systemId: number, hours: number) {
    return this.killmailService.getRecentBySystem(systemId, hours);
  }
}
