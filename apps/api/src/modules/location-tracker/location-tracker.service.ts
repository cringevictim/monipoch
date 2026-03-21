import { Inject, Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OnEvent } from '@nestjs/event-emitter';
import { ESIClient, ESIEndpoints, ESIClientError } from '@monipoch/eve-sdk';
import { ALL_TRACKED_SYSTEM_IDS } from '@monipoch/shared';
import type { Knex } from 'knex';
import { KNEX_TOKEN } from '../../database/knex.provider';
import { AuthService, type TokenSet } from '../auth/auth.service';
import type { PilotPresence } from '@monipoch/shared';

const POLL_INTERVAL_MS = 10_000;
const ONLINE_CHECK_INTERVAL_MS = 30_000;
const FLEET_CHECK_INTERVAL_MS = 30_000;
const FLEET_MEMBERS_INTERVAL_MS = 15_000;
const USER_AGENT = 'Monipoch/1.0 (location-tracker)';

interface TrackedPilot {
  characterId: number;
  characterName: string;
  solarSystemId: number;
  shipTypeId: number;
  shipName: string;
  online: boolean;
  fleetId?: number;
  fleetRole?: PilotPresence['fleetRole'];
  lastOnlineCheck: number;
  lastFleetCheck: number;
  lastLocationUpdate: number;
}

interface FleetSnapshot {
  fleetId: number;
  fcCharacterId: number;
  members: PilotPresence[];
  lastUpdate: number;
}

@Injectable()
export class LocationTrackerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LocationTrackerService.name);
  private readonly esi = new ESIEndpoints(new ESIClient(USER_AGENT));
  private readonly pilots = new Map<number, TrackedPilot>();
  private readonly fleetSnapshots = new Map<number, FleetSnapshot>();
  private readonly nameCache = new Map<number, string>();
  private readonly shipTypeNameCache = new Map<number, string>();
  private pollTimer?: ReturnType<typeof setInterval>;
  private userRefreshTimer?: ReturnType<typeof setInterval>;

  constructor(
    private authService: AuthService,
    private eventEmitter: EventEmitter2,
    @Inject(KNEX_TOKEN) private db: Knex,
  ) {}

  async onModuleInit() {
    await this.refreshTrackedUsers();
    this.userRefreshTimer = setInterval(() => this.refreshTrackedUsers(), 60_000);
    this.pollTimer = setInterval(() => this.pollAll(), POLL_INTERVAL_MS);
    this.logger.log('Location tracker started');
  }

  onModuleDestroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.userRefreshTimer) clearInterval(this.userRefreshTimer);
  }

  @OnEvent('auth.login')
  async handleLogin(payload: { characterId: number; characterName: string }) {
    if (!this.pilots.has(payload.characterId)) {
      this.pilots.set(payload.characterId, {
        characterId: payload.characterId,
        characterName: payload.characterName,
        solarSystemId: 0,
        shipTypeId: 0,
        shipName: '',
        online: false,
        lastOnlineCheck: 0,
        lastFleetCheck: 0,
        lastLocationUpdate: 0,
      });
      this.logger.log(`Pilot ${payload.characterName} added immediately after login`);
    }
  }

  private async refreshTrackedUsers() {
    try {
      const users = await this.authService.getTrackableUsers();
      const activeIds = new Set(users.map((u) => u.characterId));

      for (const [id] of this.pilots) {
        if (!activeIds.has(id)) this.pilots.delete(id);
      }

      for (const user of users) {
        if (!this.pilots.has(user.characterId)) {
          this.pilots.set(user.characterId, {
            characterId: user.characterId,
            characterName: user.characterName,
            solarSystemId: 0,
            shipTypeId: 0,
            shipName: '',
            online: false,
            lastOnlineCheck: 0,
            lastFleetCheck: 0,
            lastLocationUpdate: 0,
          });
        }
      }

      this.logger.debug(`Tracking ${this.pilots.size} pilots`);
    } catch (err) {
      this.logger.error('Failed to refresh tracked users', err);
    }
  }

  private async pollAll() {
    if (this.pilots.size === 0) return;

    const now = Date.now();
    const results: PilotPresence[] = [];
    const seenCharacterIds = new Set<number>();
    const fcTokens: { pilot: TrackedPilot; token: TokenSet }[] = [];

    const entries = [...this.pilots.values()];
    for (const pilot of entries) {
      try {
        const token = await this.authService.refreshAccessToken(pilot.characterId);
        if (!token) continue;

        if (now - pilot.lastOnlineCheck >= ONLINE_CHECK_INTERVAL_MS) {
          await this.checkOnline(pilot, token);
          pilot.lastOnlineCheck = now;
        }

        if (!pilot.online) continue;

        await this.checkLocation(pilot, token);
        await this.checkShip(pilot, token);

        if (now - pilot.lastFleetCheck >= FLEET_CHECK_INTERVAL_MS) {
          await this.checkFleet(pilot, token);
          pilot.lastFleetCheck = now;
        }

        pilot.lastLocationUpdate = now;
        seenCharacterIds.add(pilot.characterId);

        if (ALL_TRACKED_SYSTEM_IDS.has(pilot.solarSystemId)) {
          const shipTypeName = await this.resolveShipTypeName(pilot.shipTypeId);
          results.push({
            characterId: pilot.characterId,
            characterName: pilot.characterName,
            shipTypeId: pilot.shipTypeId,
            shipTypeName,
            solarSystemId: pilot.solarSystemId,
            online: pilot.online,
            fleetId: pilot.fleetId,
            fleetRole: pilot.fleetRole,
          });
        }

        if (pilot.fleetId && pilot.fleetRole === 'fleet_commander') {
          fcTokens.push({ pilot, token });
        }
      } catch (err) {
        if (err instanceof ESIClientError && err.statusCode === 403) {
          this.logger.debug(`Token revoked for character ${pilot.characterId}`);
        } else {
          this.logger.warn(`Poll error for ${pilot.characterName}: ${err}`);
        }
      }
    }

    for (const { pilot, token } of fcTokens) {
      try {
        await this.pollFleetMembers(pilot, token, now, seenCharacterIds, results);
      } catch (err) {
        this.logger.debug(`Fleet poll failed for FC ${pilot.characterName}: ${err}`);
      }
    }

    this.pruneStaleFleets(now);
    this.eventEmitter.emit('pilot.locations', { pilots: results });
  }

  private async pollFleetMembers(
    fc: TrackedPilot,
    token: TokenSet,
    now: number,
    seenCharacterIds: Set<number>,
    results: PilotPresence[],
  ) {
    const fleetId = fc.fleetId!;
    const existing = this.fleetSnapshots.get(fleetId);
    if (existing && now - existing.lastUpdate < FLEET_MEMBERS_INTERVAL_MS) {
      for (const member of existing.members) {
        if (!seenCharacterIds.has(member.characterId)) {
          seenCharacterIds.add(member.characterId);
          results.push(member);
        }
      }
      return;
    }

    const { data: members } = await this.esi.getFleetMembers(fleetId, {
      token: token.accessToken,
    });

    const unknownIds = members
      .filter((m) => !seenCharacterIds.has(m.character_id) && !this.nameCache.has(m.character_id))
      .map((m) => m.character_id);

    if (unknownIds.length > 0) {
      await this.resolveNames(unknownIds);
    }

    const fleetMembers: PilotPresence[] = [];
    for (const member of members) {
      if (seenCharacterIds.has(member.character_id)) continue;
      if (!ALL_TRACKED_SYSTEM_IDS.has(member.solar_system_id)) continue;

      const name = this.nameCache.get(member.character_id) ?? `Pilot ${member.character_id}`;
      const shipTypeName = await this.resolveShipTypeName(member.ship_type_id);
      const presence: PilotPresence = {
        characterId: member.character_id,
        characterName: name,
        shipTypeId: member.ship_type_id,
        shipTypeName,
        solarSystemId: member.solar_system_id,
        online: true,
        fleetId,
        fleetRole: member.role,
      };
      fleetMembers.push(presence);
      seenCharacterIds.add(member.character_id);
      results.push(presence);
    }

    this.fleetSnapshots.set(fleetId, {
      fleetId,
      fcCharacterId: fc.characterId,
      members: fleetMembers,
      lastUpdate: now,
    });
  }

  private async resolveShipTypeName(typeId: number): Promise<string> {
    if (typeId === 0) return '';
    const cached = this.shipTypeNameCache.get(typeId);
    if (cached) return cached;

    try {
      const resp = await fetch(
        `https://esi.evetech.net/latest/universe/types/${typeId}/?datasource=tranquility`,
        { headers: { 'User-Agent': USER_AGENT } },
      );
      if (resp.ok) {
        const data = await resp.json();
        const name = data.name ?? '';
        this.shipTypeNameCache.set(typeId, name);
        return name;
      }
    } catch { /* fallback below */ }
    return '';
  }

  private async resolveNames(ids: number[]) {
    const dbRows = await this.db('characters')
      .whereIn('character_id', ids)
      .select('character_id', 'name');

    for (const row of dbRows) {
      this.nameCache.set(row.character_id, row.name);
    }

    const stillMissing = ids.filter((id) => !this.nameCache.has(id));
    if (stillMissing.length === 0) return;

    try {
      const resp = await fetch(
        'https://esi.evetech.net/latest/universe/names/?datasource=tranquility',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
          body: JSON.stringify(stillMissing.slice(0, 500)),
        },
      );
      if (resp.ok) {
        const data: { id: number; name: string }[] = await resp.json();
        for (const entry of data) {
          this.nameCache.set(entry.id, entry.name);
        }
      }
    } catch {
      this.logger.warn(`Failed to resolve ${stillMissing.length} character names`);
    }
  }

  private pruneStaleFleets(now: number) {
    const activeFcFleetIds = new Set<number>();
    for (const pilot of this.pilots.values()) {
      if (pilot.fleetId && pilot.fleetRole === 'fleet_commander') {
        activeFcFleetIds.add(pilot.fleetId);
      }
    }
    for (const [fleetId, snapshot] of this.fleetSnapshots) {
      if (!activeFcFleetIds.has(fleetId) || now - snapshot.lastUpdate > 5 * 60_000) {
        this.fleetSnapshots.delete(fleetId);
      }
    }
  }

  private async checkOnline(pilot: TrackedPilot, token: TokenSet) {
    try {
      const { data } = await this.esi.getCharacterOnline(pilot.characterId, {
        token: token.accessToken,
      });
      pilot.online = data.online;
    } catch (err) {
      if (err instanceof ESIClientError && err.statusCode === 403) throw err;
      pilot.online = false;
    }
  }

  private async checkLocation(pilot: TrackedPilot, token: TokenSet) {
    const { data } = await this.esi.getCharacterLocation(pilot.characterId, {
      token: token.accessToken,
    });
    pilot.solarSystemId = data.solar_system_id;
  }

  private async checkShip(pilot: TrackedPilot, token: TokenSet) {
    const { data } = await this.esi.getCharacterShip(pilot.characterId, {
      token: token.accessToken,
    });
    pilot.shipTypeId = data.ship_type_id;
    pilot.shipName = data.ship_name;
  }

  private async checkFleet(pilot: TrackedPilot, token: TokenSet) {
    try {
      const { data } = await this.esi.getCharacterFleet(pilot.characterId, {
        token: token.accessToken,
      });
      pilot.fleetId = data.fleet_id;
      pilot.fleetRole = data.role;
    } catch (err) {
      if (err instanceof ESIClientError && err.statusCode === 404) {
        pilot.fleetId = undefined;
        pilot.fleetRole = undefined;
        return;
      }
      throw err;
    }
  }

  getTrackedPilotsInPochven(): PilotPresence[] {
    const results: PilotPresence[] = [];
    const seenIds = new Set<number>();

    for (const pilot of this.pilots.values()) {
      if (pilot.online && ALL_TRACKED_SYSTEM_IDS.has(pilot.solarSystemId)) {
        seenIds.add(pilot.characterId);
        results.push({
          characterId: pilot.characterId,
          characterName: pilot.characterName,
          shipTypeId: pilot.shipTypeId,
          shipTypeName: this.shipTypeNameCache.get(pilot.shipTypeId) ?? '',
          solarSystemId: pilot.solarSystemId,
          online: pilot.online,
          fleetId: pilot.fleetId,
          fleetRole: pilot.fleetRole,
        });
      }
    }

    for (const snapshot of this.fleetSnapshots.values()) {
      for (const member of snapshot.members) {
        if (!seenIds.has(member.characterId)) {
          seenIds.add(member.characterId);
          results.push(member);
        }
      }
    }

    return results;
  }
}
