import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { KillmailStream } from '@monipoch/eve-sdk';
import { ALL_TRACKED_SYSTEM_IDS, ALL_TRACKED_SYSTEM_BY_ID, type RedisQKillmail } from '@monipoch/shared';
import { KillmailService } from './killmail.service';

@Injectable()
export class KillmailIngestionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KillmailIngestionService.name);
  private stream: KillmailStream;

  constructor(
    private killmailService: KillmailService,
    private eventEmitter: EventEmitter2,
  ) {
    this.stream = new KillmailStream({
      queueId: 'monipoch-ingestion-v1',
      reconnectDelayMs: 2000,
      maxReconnectDelayMs: 30000,
    });

    this.stream.on('killmail', (km: RedisQKillmail) => {
      void this.handleKillmail(km);
    });

    this.stream.on('connected', () => {
      this.logger.log('Connected to killmail.stream');
    });

    this.stream.on('disconnected', (reason: string) => {
      this.logger.warn(`Disconnected from killmail.stream: ${reason}`);
    });

    this.stream.on('error', (err: Error) => {
      this.logger.error(`killmail.stream error: ${err.message}`);
    });
  }

  async onModuleInit() {
    this.logger.log('Starting killmail ingestion from killmail.stream...');
    await this.stream.start();
  }

  onModuleDestroy() {
    this.logger.log('Stopping killmail ingestion...');
    this.stream.removeAllListeners();
    this.stream.stop();
  }

  private async handleKillmail(km: RedisQKillmail): Promise<void> {
    const systemId = km.killmail.solar_system_id;

    if (!ALL_TRACKED_SYSTEM_IDS.has(systemId)) return;

    const system = ALL_TRACKED_SYSTEM_BY_ID.get(systemId);
    this.logger.log(
      `Pochven kill: ${km.killID} in ${system?.name ?? systemId} (${Math.round(km.zkb.totalValue / 1_000_000)}M ISK)`,
    );

    try {
      const exists = await this.killmailService.exists(km.killID);
      if (exists) return;

      await this.killmailService.insert(km.killmail, km.zkb);

      this.eventEmitter.emit('killmail.pochven', {
        killmail: km.killmail,
        zkb: km.zkb,
        systemName: system?.name ?? 'Unknown',
      });
    } catch (err) {
      this.logger.error(`Failed to process killmail ${km.killID}`, err);
    }
  }
}
