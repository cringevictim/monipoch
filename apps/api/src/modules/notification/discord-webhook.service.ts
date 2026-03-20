import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Knex } from 'knex';
import { KNEX_TOKEN } from '../../database/knex.provider';

export interface DiscordWebhookRow {
  id: number;
  user_id: number;
  name: string;
  webhook_url: string;
  event_types: string[] | null;
  enabled: boolean;
  created_at: Date;
}

export interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  timestamp: string;
  footer: { text: string };
}

const EMBED_COLORS = {
  kill: 0xed_42_45, // red
  fight: 0xe6_7e_22, // orange
  camp: 0xf1_c4_0f, // yellow
  roam: 0x34_98_db, // blue
} as const;

@Injectable()
export class DiscordWebhookService {
  private readonly logger = new Logger(DiscordWebhookService.name);

  constructor(@Inject(KNEX_TOKEN) private readonly db: Knex) {}

  async getWebhook(userId?: number): Promise<DiscordWebhookRow | null> {
    let query = this.db<DiscordWebhookRow>('discord_webhooks')
      .where('enabled', true)
      .orderBy('created_at', 'asc');

    if (userId != null) {
      query = query.where('user_id', userId);
    }

    return (await query.first()) ?? null;
  }

  async setWebhook(
    userId: number,
    url: string,
    name: string,
    eventTypes: string[],
  ): Promise<void> {
    const existing = await this.db<DiscordWebhookRow>('discord_webhooks')
      .where('user_id', userId)
      .first();

    const row = {
      user_id: userId,
      name,
      webhook_url: url,
      event_types: JSON.stringify(eventTypes),
      enabled: true,
      created_at: existing?.created_at ?? new Date(),
    };

    if (existing) {
      await this.db('discord_webhooks').where('id', existing.id).update({
        name: row.name,
        webhook_url: row.webhook_url,
        event_types: row.event_types,
        enabled: row.enabled,
      });
    } else {
      await this.db('discord_webhooks').insert(row);
    }
  }

  async send(
    eventType: string,
    event: Record<string, unknown>,
    description: string,
    userId?: number,
  ): Promise<void> {
    const webhook = await this.getWebhook(userId);
    if (!webhook) {
      this.logger.debug('No Discord webhook configured, skipping send');
      return;
    }

    const configuredTypes: string[] = webhook.event_types
      ? (typeof webhook.event_types === 'string'
          ? JSON.parse(webhook.event_types)
          : webhook.event_types)
      : [];

    if (configuredTypes.length > 0 && !configuredTypes.includes(eventType)) {
      this.logger.debug(
        `Event ${eventType} not in webhook event types [${configuredTypes.join(', ')}], skipping`,
      );
      return;
    }

    const color = this.getColorForEventType(eventType);
    const embed: DiscordEmbed = {
      title: this.getTitleForEventType(eventType),
      description,
      color,
      timestamp: new Date().toISOString(),
      footer: { text: 'Monipoch Intel' },
    };

    try {
      const res = await fetch(webhook.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] }),
      });

      if (!res.ok) {
        this.logger.warn(
          `Discord webhook failed: ${res.status} ${await res.text()}`,
        );
      }
    } catch (err) {
      this.logger.error('Discord webhook request failed', err);
    }
  }

  async testWebhook(webhookUrl: string): Promise<boolean> {
    try {
      const embed: DiscordEmbed = {
        title: 'Test Notification',
        description: 'Monipoch Discord webhook is configured correctly.',
        color: 0x2e_cc_71, // green
        timestamp: new Date().toISOString(),
        footer: { text: 'Monipoch Intel' },
      };

      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] }),
      });

      return res.ok;
    } catch (err) {
      this.logger.error('Discord webhook test failed', err);
      return false;
    }
  }

  private getColorForEventType(eventType: string): number {
    if (eventType.includes('killmail') || eventType.includes('kill')) {
      return EMBED_COLORS.kill;
    }
    if (eventType.includes('fight')) {
      return EMBED_COLORS.fight;
    }
    if (eventType.includes('camp')) {
      return EMBED_COLORS.camp;
    }
    if (eventType.includes('roam')) {
      return EMBED_COLORS.roam;
    }
    return EMBED_COLORS.fight;
  }

  private getTitleForEventType(eventType: string): string {
    switch (eventType) {
      case 'killmail.pochven':
        return 'Pochven Kill';
      case 'fight.update':
        return 'Fight Update';
      case 'camp.detected':
        return 'Gate Camp Detected';
      case 'roam.tracked':
        return 'Roam Tracked';
      default:
        return 'Intel Alert';
    }
  }
}
