import { Controller, Get, Post, Body, Inject, NotFoundException, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Knex } from 'knex';
import type { Request } from 'express';
import { randomUUID } from 'crypto';
import { KNEX_TOKEN } from '../../database/knex.provider';
import { Public } from '../auth/public.decorator';
import { FleetTrackerService } from '../tactical-intel/fleet-tracker.service';
import { FightDetectionService } from '../fight-detection/fight-detection.service';
import {
  WsEventType,
  FightStatus,
  FightClassification,
  POCHVEN_SYSTEMS,
  EXTRA_TRACKED_SYSTEMS,
  type SessionUser,
  type ESIKillmail,
  type ZKBMetadata,
  type DetectedFight,
} from '@monipoch/shared';

const ALL_SYSTEMS = [...POCHVEN_SYSTEMS, ...EXTRA_TRACKED_SYSTEMS];

function pickSystem(systemId?: number) {
  if (systemId) {
    const sys = ALL_SYSTEMS.find((s) => s.systemId === systemId);
    return sys ?? ALL_SYSTEMS[0];
  }
  return ALL_SYSTEMS[Math.floor(Math.random() * ALL_SYSTEMS.length)];
}

let nextFakeKillId = 900_000_000;

function fakeKillmail(systemId: number, attackerCount = 5, value = 50_000_000): { killmail: ESIKillmail; zkb: ZKBMetadata } {
  const kmId = nextFakeKillId++;
  const attackers = Array.from({ length: attackerCount }, (_, i) => ({
    character_id: 2100000000 + i,
    corporation_id: 98000001,
    alliance_id: 99000001,
    damage_done: Math.floor(Math.random() * 5000) + 500,
    final_blow: i === 0,
    security_status: -5.0,
    ship_type_id: [587, 11393, 29984, 22456, 34562][i % 5],
    weapon_type_id: 3170,
  }));

  const killmail: ESIKillmail = {
    killmail_id: kmId,
    killmail_time: new Date().toISOString(),
    solar_system_id: systemId,
    victim: {
      character_id: 2200000000 + Math.floor(Math.random() * 1000),
      corporation_id: 98000002,
      alliance_id: 99000002,
      damage_taken: attackers.reduce((s, a) => s + a.damage_done, 0),
      ship_type_id: [670, 24690, 17703, 621, 12005][Math.floor(Math.random() * 5)],
    },
    attackers,
  };

  const zkb: ZKBMetadata = {
    hash: randomUUID().replace(/-/g, ''),
    fittedValue: value * 0.6,
    droppedValue: value * 0.15,
    destroyedValue: value * 0.85,
    totalValue: value,
    points: Math.floor(value / 10_000),
    npc: false,
    solo: attackerCount === 1,
    awox: false,
  };

  return { killmail, zkb };
}

@Public()
@Controller('api/debug')
export class DebugController {
  constructor(
    private config: ConfigService,
    @Inject(KNEX_TOKEN) private db: Knex,
    private eventEmitter: EventEmitter2,
    private fleetTracker: FleetTrackerService,
    private fightDetection: FightDetectionService,
  ) {}

  private assertDebug() {
    if (!this.config.get<boolean>('debug')) {
      throw new NotFoundException();
    }
  }

  /* ───────────── Original info endpoint ───────────── */

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

  /* ───────────── Scenario list ───────────── */

  @Get('scenarios')
  getScenarios() {
    this.assertDebug();
    return {
      systems: ALL_SYSTEMS.map((s) => ({ systemId: s.systemId, name: s.name })),
      scenarios: [
        { id: 'kill', label: 'Single Kill', description: 'Full pipeline — ticker, heatmap, fight/camp/roam detection, sound' },
        { id: 'kill-expensive', label: '10B Kill', description: 'High-value kill through full pipeline' },
        { id: 'kill-burst', label: 'Kill Burst (5x)', description: 'Rapid-fire 5 kills through full pipeline' },
        { id: 'fight-start', label: 'Fight Started', description: 'Starts a fight indicator in a system' },
        { id: 'fight-escalate', label: 'Fight Escalated', description: 'Escalates an ongoing fight with more kills' },
        { id: 'fight-end', label: 'Fight Ended', description: 'Ends an active fight' },
        { id: 'camp', label: 'Gate Camp', description: 'Injects a gate camp fleet group into tactical intel' },
        { id: 'roam', label: 'Roaming Fleet', description: 'Injects a roaming fleet group into tactical intel' },
        { id: 'pilots', label: 'Pilot Presence', description: 'Simulates alliance pilots in a system' },
        { id: 'notification', label: 'Notification', description: 'Broadcasts a notification event' },
      ],
    };
  }

  /* ───────────── Simulate endpoints ───────────── */

  private emitKill(systemId: number, systemName: string, attackerCount = 5, value = 50_000_000) {
    const { killmail, zkb } = fakeKillmail(systemId, attackerCount, value);
    this.eventEmitter.emit('killmail.pochven', { killmail, zkb, systemName });
    return killmail.killmail_id;
  }

  @Post('simulate/kill')
  simulateKill(@Body() body: { systemId?: number; value?: number }) {
    this.assertDebug();
    const sys = pickSystem(body.systemId);
    const kmId = this.emitKill(sys.systemId, sys.name, 5, body.value ?? 50_000_000);
    return { ok: true, scenario: 'kill', systemName: sys.name, killmailId: kmId };
  }

  @Post('simulate/kill-expensive')
  simulateExpensiveKill(@Body() body: { systemId?: number }) {
    this.assertDebug();
    const sys = pickSystem(body.systemId);
    const kmId = this.emitKill(sys.systemId, sys.name, 3, 10_000_000_000);
    return { ok: true, scenario: 'kill-expensive', systemName: sys.name, killmailId: kmId };
  }

  @Post('simulate/kill-burst')
  simulateKillBurst(@Body() body: { systemId?: number; count?: number }) {
    this.assertDebug();
    const sys = pickSystem(body.systemId);
    const count = Math.min(body.count ?? 5, 20);
    const ids: number[] = [];

    for (let i = 0; i < count; i++) {
      const delay = i * 800;
      setTimeout(() => {
        const kmId = this.emitKill(sys.systemId, sys.name, 5, 30_000_000 + Math.random() * 200_000_000);
        ids.push(kmId);
      }, delay);
    }

    return { ok: true, scenario: 'kill-burst', systemName: sys.name, count };
  }

  @Post('simulate/fight-start')
  simulateFightStart(@Body() body: { systemId?: number }) {
    this.assertDebug();
    const sys = pickSystem(body.systemId);
    const fightId = `debug-fight-${randomUUID().slice(0, 8)}`;

    const fight: DetectedFight = {
      id: fightId,
      systemId: sys.systemId,
      systemName: sys.name,
      status: FightStatus.ONGOING,
      classification: FightClassification.SMALL_GANG,
      startedAt: new Date().toISOString(),
      lastKillAt: new Date().toISOString(),
      lastReceivedAt: new Date().toISOString(),
      sides: [],
      totalKills: 3,
      totalIskDestroyed: 150_000_000,
      killmailIds: [nextFakeKillId++, nextFakeKillId++, nextFakeKillId++],
    };

    this.eventEmitter.emit('fight.update', { type: WsEventType.FIGHT_STARTED, fight });
    return { ok: true, scenario: 'fight-start', fightId, systemName: sys.name };
  }

  @Post('simulate/fight-escalate')
  simulateFightEscalate(@Body() body: { systemId?: number }) {
    this.assertDebug();
    const sys = pickSystem(body.systemId);
    const activeFights = this.fightDetection.getActiveFights();
    const existing = body.systemId
      ? activeFights.find((f) => f.systemId === body.systemId)
      : activeFights[0];

    if (existing) {
      existing.totalKills += 5;
      existing.totalIskDestroyed += 500_000_000;
      existing.classification = FightClassification.MEDIUM_GANG;
      existing.lastKillAt = new Date().toISOString();
      existing.lastReceivedAt = new Date().toISOString();
      this.eventEmitter.emit('fight.update', { type: WsEventType.FIGHT_UPDATED, fight: existing });
      return { ok: true, scenario: 'fight-escalate', fightId: existing.id, systemName: existing.systemName };
    }

    const fightId = `debug-fight-${randomUUID().slice(0, 8)}`;
    const fight: DetectedFight = {
      id: fightId,
      systemId: sys.systemId,
      systemName: sys.name,
      status: FightStatus.ONGOING,
      classification: FightClassification.MEDIUM_GANG,
      startedAt: new Date(Date.now() - 3 * 60_000).toISOString(),
      lastKillAt: new Date().toISOString(),
      lastReceivedAt: new Date().toISOString(),
      sides: [],
      totalKills: 8,
      totalIskDestroyed: 650_000_000,
      killmailIds: Array.from({ length: 8 }, () => nextFakeKillId++),
    };

    this.eventEmitter.emit('fight.update', { type: WsEventType.FIGHT_UPDATED, fight });
    return { ok: true, scenario: 'fight-escalate', fightId, systemName: sys.name };
  }

  @Post('simulate/fight-end')
  simulateFightEnd(@Body() body: { systemId?: number }) {
    this.assertDebug();
    const activeFights = this.fightDetection.getActiveFights();
    const target = body.systemId
      ? activeFights.find((f) => f.systemId === body.systemId)
      : activeFights[0];

    if (target) {
      target.status = FightStatus.CONCLUDED;
      target.endedAt = new Date().toISOString();
      this.eventEmitter.emit('fight.update', { type: WsEventType.FIGHT_ENDED, fight: target });
      return { ok: true, scenario: 'fight-end', fightId: target.id, systemName: target.systemName };
    }

    const sys = pickSystem(body.systemId);
    const fight: DetectedFight = {
      id: `debug-fight-ended-${randomUUID().slice(0, 8)}`,
      systemId: sys.systemId,
      systemName: sys.name,
      status: FightStatus.CONCLUDED,
      classification: FightClassification.SMALL_GANG,
      startedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
      lastKillAt: new Date(Date.now() - 2 * 60_000).toISOString(),
      lastReceivedAt: new Date(Date.now() - 2 * 60_000).toISOString(),
      endedAt: new Date().toISOString(),
      sides: [],
      totalKills: 5,
      totalIskDestroyed: 300_000_000,
      killmailIds: Array.from({ length: 5 }, () => nextFakeKillId++),
    };

    this.eventEmitter.emit('fight.update', { type: WsEventType.FIGHT_ENDED, fight });
    return { ok: true, scenario: 'fight-end', fightId: fight.id, systemName: sys.name };
  }

  @Post('simulate/camp')
  simulateCamp(@Body() body: { systemId?: number }) {
    this.assertDebug();
    const sys = pickSystem(body.systemId);
    const now = Date.now();
    const groupId = `debug-camp-${randomUUID().slice(0, 8)}`;

    const chars = new Map<number, any>();
    for (let i = 0; i < 6; i++) {
      chars.set(2100000100 + i, {
        characterId: 2100000100 + i,
        corporationId: 98000001,
        allianceId: 99000001,
        shipTypeId: [587, 11393, 22456, 29984, 34562, 17812][i],
      });
    }

    const group = {
      id: groupId,
      characters: chars,
      shipTypes: new Set([587, 11393, 22456, 29984, 34562, 17812]),
      systemHistory: [{ systemId: sys.systemId, systemName: sys.name, timestamp: now }],
      currentSystemId: sys.systemId,
      killCount: 4,
      anchorGateId: 50016281,
      anchorKills: 4,
      nonAnchorKills: 0,
      firstSeenAt: now - 10 * 60_000,
      lastKillAt: now,
      killmailIds: new Set(Array.from({ length: 4 }, () => nextFakeKillId++)),
    };

    (this.fleetTracker as any).groups.set(groupId, group);

    return { ok: true, scenario: 'camp', groupId, systemName: sys.name };
  }

  @Post('simulate/roam')
  simulateRoam(@Body() body: { systemId?: number }) {
    this.assertDebug();
    const sys1 = pickSystem(body.systemId);
    const sys2Idx = (ALL_SYSTEMS.indexOf(sys1) + 1) % ALL_SYSTEMS.length;
    const sys2 = ALL_SYSTEMS[sys2Idx];
    const now = Date.now();
    const groupId = `debug-roam-${randomUUID().slice(0, 8)}`;

    const chars = new Map<number, any>();
    for (let i = 0; i < 8; i++) {
      chars.set(2100000200 + i, {
        characterId: 2100000200 + i,
        corporationId: 98000003,
        allianceId: 99000003,
        shipTypeId: [587, 22456, 17703, 29984, 621, 11393, 34562, 17812][i],
      });
    }

    const group = {
      id: groupId,
      characters: chars,
      shipTypes: new Set([587, 22456, 17703, 29984, 621, 11393, 34562, 17812]),
      systemHistory: [
        { systemId: sys1.systemId, systemName: sys1.name, timestamp: now - 5 * 60_000 },
        { systemId: sys2.systemId, systemName: sys2.name, timestamp: now },
      ],
      currentSystemId: sys2.systemId,
      killCount: 5,
      anchorGateId: null,
      anchorKills: 0,
      nonAnchorKills: 5,
      firstSeenAt: now - 8 * 60_000,
      lastKillAt: now,
      killmailIds: new Set(Array.from({ length: 5 }, () => nextFakeKillId++)),
    };

    (this.fleetTracker as any).groups.set(groupId, group);

    return { ok: true, scenario: 'roam', groupId, path: [sys1.name, sys2.name] };
  }

  @Post('simulate/notification')
  simulateNotification(@Body() body: { title?: string; description?: string; eventType?: string }) {
    this.assertDebug();

    this.eventEmitter.emit('notification.push', {
      userId: 0,
      eventType: body.eventType ?? 'camp.detected',
      description: body.description ?? 'Debug notification — gate camp detected in Nalvula',
    });

    return { ok: true, scenario: 'notification' };
  }

  @Post('simulate/pilots')
  simulatePilots(@Body() body: { systemId?: number; count?: number }) {
    this.assertDebug();
    const sys = pickSystem(body.systemId);
    const count = Math.min(body.count ?? 3, 10);

    const FLEET_ROLES: (undefined | 'fleet_commander' | 'wing_commander' | 'squad_commander' | 'squad_member')[] = [
      'fleet_commander', 'wing_commander', 'squad_commander', 'squad_member', 'squad_member',
      undefined, undefined, undefined, undefined, undefined,
    ];

    const pilots = Array.from({ length: count }, (_, i) => ({
      characterId: 96491572 + i,
      characterName: ['Debug Pilot', 'Test Capsuleer', 'Fleet Cmdr', 'Scout Alpha', 'Logi Bravo', 'DPS Charlie', 'Tackle Delta', 'Boosher Echo', 'Dictor Foxtrot', 'Sabre Golf'][i % 10],
      shipTypeId: [587, 11393, 22456, 29984, 34562, 17812, 670, 24690, 17703, 621][i % 10],
      shipTypeName: ['Rifter', 'Stiletto', 'Vagabond', 'Huginn', 'Loki', 'Claymore', 'Capsule', 'Drake', 'Tempest', 'Heron'][i % 10],
      solarSystemId: sys.systemId,
      online: true,
      fleetId: FLEET_ROLES[i % 10] ? 1000000 : undefined,
      fleetRole: FLEET_ROLES[i % 10],
    }));

    this.eventEmitter.emit('pilot.locations', { pilots });
    return { ok: true, scenario: 'pilots', systemName: sys.name, count };
  }

  @Post('simulate/clear')
  simulateClear() {
    this.assertDebug();
    (this.fleetTracker as any).groups.clear();
    this.eventEmitter.emit('pilot.locations', { pilots: [] });
    return { ok: true, scenario: 'clear' };
  }
}
