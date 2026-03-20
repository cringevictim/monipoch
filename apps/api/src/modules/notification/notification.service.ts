import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Knex } from 'knex';
import { KNEX_TOKEN } from '../../database/knex.provider';
import { DiscordWebhookService } from './discord-webhook.service';

export interface AlertRuleRow {
  id: number;
  user_id: number;
  event_type: string;
  conditions: Record<string, unknown> | null;
  enabled: boolean;
  browser_notify: boolean;
  discord_notify: boolean;
  created_at: Date;
}

export interface CreateRuleDto {
  eventType: string;
  conditions?: Record<string, unknown>;
  browserNotify?: boolean;
  discordNotify?: boolean;
}

export interface UpdateRuleDto {
  eventType?: string;
  conditions?: Record<string, unknown>;
  enabled?: boolean;
  browserNotify?: boolean;
  discordNotify?: boolean;
}

export interface SoundPreferences {
  kill_sound: boolean;
  fight_sound: boolean;
  camp_sound: boolean;
  roam_sound: boolean;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @Inject(KNEX_TOKEN) private readonly db: Knex,
    private readonly eventEmitter: EventEmitter2,
    private readonly discordWebhookService: DiscordWebhookService,
  ) {}

  private matchesConditions(
    conditions: Record<string, unknown> | null,
    payload: Record<string, unknown>,
  ): boolean {
    if (!conditions || Object.keys(conditions).length === 0) return true;

    const parsed = typeof conditions === 'string' ? JSON.parse(conditions) : conditions;

    for (const [key, value] of Object.entries(parsed)) {
      if (key === 'systemId') {
        const systemId = this.extractSystemId(payload);
        if (systemId != null && value !== systemId) return false;
      } else if (key === 'system') {
        const systemName = this.extractSystemName(payload);
        if (
          systemName != null &&
          typeof value === 'string' &&
          !systemName.toLowerCase().includes(value.toLowerCase())
        ) {
          return false;
        }
      } else if (key === 'minIsk' || key === 'min_isk') {
        const totalValue = this.extractTotalValue(payload);
        if (totalValue != null && totalValue < Number(value)) return false;
      }
    }
    return true;
  }

  private extractSystemName(payload: Record<string, unknown>): string | null {
    if (typeof payload.systemName === 'string') return payload.systemName;
    const fight = payload.fight as { systemName?: string } | undefined;
    if (fight?.systemName) return fight.systemName;
    const camp = payload.camp as { systemName?: string } | undefined;
    if (camp?.systemName) return camp.systemName;
    return null;
  }

  private extractSystemId(payload: Record<string, unknown>): number | null {
    const systemId = payload.systemId ?? payload.solar_system_id;
    if (typeof systemId === 'number') return systemId;
    const killmail = payload.killmail as { solar_system_id?: number } | undefined;
    if (killmail?.solar_system_id != null) return killmail.solar_system_id;
    const fight = payload.fight as { systemId?: number } | undefined;
    if (fight?.systemId != null) return fight.systemId;
    const camp = payload.camp as { systemId?: number } | undefined;
    if (camp?.systemId != null) return camp.systemId;
    return null;
  }

  private extractTotalValue(payload: Record<string, unknown>): number | null {
    const zkb = payload.zkb as { totalValue?: number } | undefined;
    if (zkb?.totalValue != null) return Number(zkb.totalValue);
    const fight = payload.fight as { totalIskDestroyed?: number } | undefined;
    if (fight?.totalIskDestroyed != null) return Number(fight.totalIskDestroyed);
    return null;
  }

  private buildDescription(
    eventType: string,
    payload: Record<string, unknown>,
  ): string {
    const systemName =
      (payload.systemName as string) ??
      (payload.fight as { systemName?: string } | undefined)?.systemName ??
      (payload.camp as { systemName?: string } | undefined)?.systemName ??
      'Unknown';

    switch (eventType) {
      case 'killmail.pochven': {
        const zkb = payload.zkb as { totalValue?: number } | undefined;
        const isk = zkb?.totalValue
          ? `${Math.round(Number(zkb.totalValue) / 1_000_000)}M`
          : '?';
        return `Kill in **${systemName}** (${isk} ISK)`;
      }
      case 'fight.update': {
        const fight = payload.fight as {
          totalKills?: number;
          totalIskDestroyed?: number;
          status?: string;
        } | undefined;
        const kills = fight?.totalKills ?? 0;
        const isk = fight?.totalIskDestroyed
          ? `${Math.round(Number(fight.totalIskDestroyed) / 1_000_000)}M`
          : '?';
        return `Fight in **${systemName}**: ${kills} kills, ${isk} ISK destroyed`;
      }
      case 'camp.detected': {
        const camp = payload.camp as { killCount?: number } | undefined;
        const count = camp?.killCount ?? 0;
        return `Gate camp in **${systemName}** (${count} kills)`;
      }
      case 'roam.tracked': {
        const roam = payload as { entityName?: string; pilotCount?: number };
        const name = roam?.entityName ?? 'Unknown';
        const pilots = roam?.pilotCount ?? '?';
        return `Roam tracked: **${name}** (${pilots} pilots) in ${systemName}`;
      }
      default:
        return `Intel alert in **${systemName}**`;
    }
  }

  @OnEvent('killmail.pochven')
  async handleKillmailPochven(payload: {
    killmail: unknown;
    zkb: { totalValue?: number };
    systemName: string;
  }): Promise<void> {
    await this.processEvent('killmail.pochven', {
      killmail: payload.killmail,
      zkb: payload.zkb,
      systemName: payload.systemName,
      solar_system_id: (payload.killmail as { solar_system_id?: number })
        ?.solar_system_id,
    });
  }

  @OnEvent('fight.update')
  async handleFightUpdate(payload: { type: string; fight: unknown }): Promise<void> {
    const fight = payload.fight as Record<string, unknown>;
    await this.processEvent('fight.update', {
      type: payload.type,
      fight,
      systemId: fight?.systemId,
      systemName: fight?.systemName,
      totalIskDestroyed: fight?.totalIskDestroyed,
    });
  }

  @OnEvent('camp.detected')
  async handleCampDetected(payload: {
    camp: {
      systemId: number;
      systemName: string;
      killCount?: number;
      [key: string]: unknown;
    };
  }): Promise<void> {
    await this.processEvent('camp.detected', {
      camp: payload.camp,
      systemId: payload.camp.systemId,
      systemName: payload.camp.systemName,
      killCount: payload.camp.killCount,
    });
  }

  @OnEvent('roam.tracked')
  async handleRoamTracked(payload: Record<string, unknown>): Promise<void> {
    await this.processEvent('roam.tracked', payload);
  }

  private async processEvent(
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const rules = await this.db<AlertRuleRow>('alert_rules')
      .where('event_type', eventType)
      .where('enabled', true)
      .select('*');

    for (const rule of rules) {
      if (!this.matchesConditions(rule.conditions, payload)) continue;

      if (rule.discord_notify) {
        const description = this.buildDescription(eventType, payload);
        await this.discordWebhookService.send(
          eventType,
          payload,
          description,
          rule.user_id,
        );
      }

      if (rule.browser_notify) {
        this.eventEmitter.emit('notification.push', {
          userId: rule.user_id,
          rule,
          eventType,
          event: payload,
          description: this.buildDescription(eventType, payload),
        });
      }
    }
  }

  async getRules(userId: number): Promise<AlertRuleRow[]> {
    const rows = await this.db<AlertRuleRow>('alert_rules')
      .where('user_id', userId)
      .orderBy('created_at', 'desc')
      .select('*');

    return rows.map((r) => ({
      ...r,
      conditions:
        typeof r.conditions === 'string'
          ? JSON.parse(r.conditions)
          : (r.conditions ?? {}),
    }));
  }

  async createRule(userId: number, dto: CreateRuleDto): Promise<AlertRuleRow> {
    const [id] = await this.db('alert_rules').insert({
      user_id: userId,
      event_type: dto.eventType,
      conditions: dto.conditions ? JSON.stringify(dto.conditions) : null,
      enabled: true,
      browser_notify: dto.browserNotify ?? true,
      discord_notify: dto.discordNotify ?? false,
    });

    const inserted = await this.db<AlertRuleRow>('alert_rules')
      .where('id', id)
      .first();
    if (!inserted) throw new Error('Failed to fetch created rule');
    return inserted;
  }

  async updateRule(
    ruleId: number,
    userId: number,
    dto: UpdateRuleDto,
  ): Promise<AlertRuleRow | null> {
    const existing = await this.db<AlertRuleRow>('alert_rules')
      .where('id', ruleId)
      .where('user_id', userId)
      .first();

    if (!existing) return null;

    const updates: Partial<AlertRuleRow> = {};
    if (dto.eventType != null) updates.event_type = dto.eventType;
    if (dto.conditions != null)
      updates.conditions = JSON.stringify(dto.conditions) as unknown as Record<
        string,
        unknown
      > | null;
    if (dto.enabled != null) updates.enabled = dto.enabled;
    if (dto.browserNotify != null) updates.browser_notify = dto.browserNotify;
    if (dto.discordNotify != null) updates.discord_notify = dto.discordNotify;

    if (Object.keys(updates).length === 0) return existing;

    await this.db('alert_rules').where('id', ruleId).update(updates);
    return (
      (await this.db<AlertRuleRow>('alert_rules').where('id', ruleId).first()) ??
      null
    );
  }

  async deleteRule(ruleId: number, userId: number): Promise<boolean> {
    const deleted = await this.db('alert_rules')
      .where('id', ruleId)
      .where('user_id', userId)
      .delete();
    return deleted > 0;
  }

  async getSoundPreferences(userId: number): Promise<SoundPreferences> {
    const row = await this.db('sound_preferences')
      .where('user_id', userId)
      .first();

    if (!row) {
      return {
        kill_sound: true,
        fight_sound: true,
        camp_sound: true,
        roam_sound: true,
      };
    }

    return {
      kill_sound: Boolean(row.kill_sound),
      fight_sound: Boolean(row.fight_sound),
      camp_sound: Boolean(row.camp_sound),
      roam_sound: Boolean(row.roam_sound),
    };
  }

  async setSoundPreferences(
    userId: number,
    prefs: Partial<SoundPreferences>,
  ): Promise<SoundPreferences> {
    const existing = await this.db('sound_preferences')
      .where('user_id', userId)
      .first();

    if (existing) {
      await this.db('sound_preferences')
        .where('user_id', userId)
        .update({ ...prefs, updated_at: new Date() });
    } else {
      await this.db('sound_preferences').insert({
        user_id: userId,
        kill_sound: prefs.kill_sound ?? true,
        fight_sound: prefs.fight_sound ?? true,
        camp_sound: prefs.camp_sound ?? true,
        roam_sound: prefs.roam_sound ?? true,
      });
    }

    return this.getSoundPreferences(userId);
  }
}
