import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Knex } from 'knex';
import { randomUUID } from 'crypto';
import { KNEX_TOKEN } from '../../database/knex.provider';
import {
  FightStatus,
  FightClassification,
  POCHVEN_SYSTEM_BY_ID,
  type DetectedFight,
  type ESIKillmail,
  type ZKBMetadata,
  WsEventType,
} from '@monipoch/shared';

const FIGHT_WINDOW_MS = 5 * 60 * 1000;
const FIGHT_TIMEOUT_MS = 5 * 60 * 1000;

@Injectable()
export class FightDetectionService {
  private readonly logger = new Logger(FightDetectionService.name);
  private activeFights = new Map<number, DetectedFight>();

  constructor(
    @Inject(KNEX_TOKEN) private db: Knex,
    private eventEmitter: EventEmitter2,
  ) {}

  @OnEvent('killmail.pochven')
  async handleKill(payload: {
    killmail: ESIKillmail;
    zkb: ZKBMetadata;
    systemName: string;
  }): Promise<void> {
    const { killmail, zkb } = payload;
    const systemId = killmail.solar_system_id;
    const killTime = new Date(killmail.killmail_time).getTime();

    if (Date.now() - killTime > 20 * 60 * 1000) return;

    const existingFight = this.activeFights.get(systemId);

    if (existingFight && existingFight.status === FightStatus.ONGOING) {
      const timeSinceLastKill = killTime - new Date(existingFight.lastKillAt).getTime();

      if (timeSinceLastKill <= FIGHT_WINDOW_MS) {
        await this.addKillToFight(existingFight, killmail, zkb);
        return;
      }

      existingFight.status = FightStatus.CONCLUDED;
      existingFight.endedAt = new Date().toISOString();
      await this.persistFight(existingFight);

      this.eventEmitter.emit('fight.update', {
        type: WsEventType.FIGHT_ENDED,
        fight: existingFight,
      });

      this.logger.log(
        `Fight concluded in ${existingFight.systemName} (superseded): ${existingFight.totalKills} kills`,
      );
    }

    const fight = await this.createNewFight(killmail, zkb, payload.systemName);
    this.activeFights.set(systemId, fight);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async checkFightTimeouts(): Promise<void> {
    const now = Date.now();

    for (const [systemId, fight] of this.activeFights.entries()) {
      if (fight.status !== FightStatus.ONGOING) continue;

      const lastReceived = new Date(fight.lastReceivedAt).getTime();
      if (now - lastReceived > FIGHT_TIMEOUT_MS) {
        fight.status = FightStatus.CONCLUDED;
        fight.endedAt = new Date().toISOString();

        await this.persistFight(fight);
        this.activeFights.delete(systemId);

        this.eventEmitter.emit('fight.update', {
          type: WsEventType.FIGHT_ENDED,
          fight,
        });

        this.logger.log(
          `Fight concluded in ${fight.systemName}: ${fight.totalKills} kills, ${Math.round(fight.totalIskDestroyed / 1_000_000)}M ISK`,
        );
      }
    }
  }

  getActiveFights(): DetectedFight[] {
    return Array.from(this.activeFights.values()).filter(
      (f) => f.status === FightStatus.ONGOING,
    );
  }

  private async createNewFight(
    killmail: ESIKillmail,
    zkb: ZKBMetadata,
    systemName: string,
  ): Promise<DetectedFight> {
    const fight: DetectedFight = {
      id: randomUUID(),
      systemId: killmail.solar_system_id,
      systemName,
      status: FightStatus.ONGOING,
      classification: FightClassification.SOLO,
      startedAt: killmail.killmail_time,
      lastKillAt: killmail.killmail_time,
      lastReceivedAt: new Date().toISOString(),
      sides: [],
      totalKills: 1,
      totalIskDestroyed: Math.round(zkb.totalValue),
      killmailIds: [killmail.killmail_id],
    };

    this.updateClassification(fight, killmail);

    this.eventEmitter.emit('fight.update', {
      type: WsEventType.FIGHT_STARTED,
      fight,
    });

    this.logger.log(`Fight detected in ${systemName}`);
    return fight;
  }

  private async addKillToFight(
    fight: DetectedFight,
    killmail: ESIKillmail,
    zkb: ZKBMetadata,
  ): Promise<void> {
    fight.killmailIds.push(killmail.killmail_id);
    fight.totalKills++;
    fight.totalIskDestroyed += Math.round(zkb.totalValue);
    fight.lastKillAt = killmail.killmail_time;
    fight.lastReceivedAt = new Date().toISOString();

    this.updateClassification(fight, killmail);

    this.eventEmitter.emit('fight.update', {
      type: WsEventType.FIGHT_UPDATED,
      fight,
    });
  }

  private updateClassification(fight: DetectedFight, killmail: ESIKillmail): void {
    const attackerCount = killmail.attackers.filter((a) => a.character_id).length;
    const totalPilots = attackerCount + 1;

    const hasCapital = killmail.attackers.some((a) => this.isCapitalShip(a.ship_type_id));

    if (hasCapital) {
      fight.classification = FightClassification.CAPITAL_ESCALATION;
    } else if (totalPilots >= 30 || fight.totalKills >= 15) {
      fight.classification = FightClassification.LARGE_FLEET;
    } else if (totalPilots >= 10 || fight.totalKills >= 5) {
      fight.classification = FightClassification.MEDIUM_GANG;
    } else if (totalPilots >= 2 || fight.totalKills >= 2) {
      fight.classification = FightClassification.SMALL_GANG;
    } else {
      fight.classification = FightClassification.SOLO;
    }
  }

  private isCapitalShip(shipTypeId?: number): boolean {
    if (!shipTypeId) return false;
    const capitalTypeIds = new Set([
      // Dreadnoughts
      19720, 19722, 19724, 19726, 42241, 42243, 45647, 52907,
      // Carriers
      23757, 23911, 23915, 24311, 42125,
      // Supercarriers
      3514, 22852, 23913, 23917, 23919,
      // Titans
      3764, 11567, 23773, 23774, 42126, 42241,
      // Force Auxiliaries
      37604, 37605, 37606, 37607,
    ]);
    return capitalTypeIds.has(shipTypeId);
  }

  private async persistFight(fight: DetectedFight): Promise<void> {
    try {
      await this.db('fights').insert({
        id: fight.id,
        solar_system_id: fight.systemId,
        status: fight.status,
        classification: fight.classification,
        started_at: new Date(fight.startedAt),
        last_kill_at: new Date(fight.lastKillAt),
        ended_at: fight.endedAt ? new Date(fight.endedAt) : null,
        total_kills: fight.totalKills,
        total_isk_destroyed: fight.totalIskDestroyed,
      });

      if (fight.killmailIds.length > 0) {
        const fkRows = fight.killmailIds.map((kmId) => ({
          fight_id: fight.id,
          killmail_id: kmId,
        }));
        await this.db('fight_killmails').insert(fkRows).onConflict().ignore();
      }
    } catch (err) {
      this.logger.error(`Failed to persist fight ${fight.id}`, err);
    }
  }
}
