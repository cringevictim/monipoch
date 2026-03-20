import { Inject, Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Knex } from 'knex';
import { KNEX_TOKEN } from '../../database/knex.provider';
import { POCHVEN_REGION_ID, POCHVEN_SYSTEM_IDS } from '@monipoch/shared';
import { ZKBApi, ESIClient, ESIEndpoints } from '@monipoch/eve-sdk';
import { KillmailService } from '../killmail/killmail.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

const USER_AGENT = 'monipoch-backfill/1.0 (https://github.com/monipoch)';
const ZKB_PAGE_DELAY_MS = 1200;
const ESI_CALL_DELAY_MS = 350;
const MAX_CONSECUTIVE_EXISTING = 200;
const MAX_PAGES = 300;

@Injectable()
export class BackfillService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackfillService.name);
  private readonly zkb = new ZKBApi({ userAgent: USER_AGENT });
  private readonly esi = new ESIEndpoints(new ESIClient(USER_AGENT));
  private running = false;
  private initTimer?: ReturnType<typeof setTimeout>;

  constructor(
    @Inject(KNEX_TOKEN) private db: Knex,
    private killmailService: KillmailService,
    private eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    this.initTimer = setTimeout(() => void this.runBackfill(), 15_000);
  }

  onModuleDestroy() {
    if (this.initTimer) clearTimeout(this.initTimer);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async scheduledBackfill() {
    await this.runBackfill();
  }

  async runBackfill(): Promise<void> {
    if (this.running) {
      this.logger.debug('Backfill already running, skipping');
      return;
    }

    this.running = true;
    let totalInserted = 0;
    let totalSkipped = 0;
    let consecutiveExisting = 0;

    try {
      const oldestKill = await this.db('killmails')
        .select('killmail_time')
        .orderBy('killmail_time', 'asc')
        .first();
      const newestKill = await this.db('killmails')
        .select('killmail_time')
        .orderBy('killmail_time', 'desc')
        .first();
      const existingCount = await this.db('killmails').count('* as cnt').first();

      this.logger.log(
        `Starting backfill — DB has ${existingCount?.cnt ?? 0} kills ` +
        `(${oldestKill?.killmail_time ?? 'none'} → ${newestKill?.killmail_time ?? 'none'})`,
      );

      for (let page = 1; page <= MAX_PAGES; page++) {
        await this.sleep(ZKB_PAGE_DELAY_MS);

        let kills;
        try {
          kills = await this.zkb.getKillsByRegion(POCHVEN_REGION_ID, page);
        } catch (err: any) {
          if (err.message?.includes('429') || err.message?.includes('420')) {
            this.logger.warn('zKB rate limit, waiting 60s...');
            await this.sleep(60_000);
            page--;
            continue;
          }
          throw err;
        }

        if (!kills || kills.length === 0) {
          this.logger.log('No more kills from zKB, backfill complete');
          break;
        }

        for (const kill of kills) {
          const exists = await this.killmailService.exists(kill.killmail_id);
          if (exists) {
            totalSkipped++;
            consecutiveExisting++;
            if (consecutiveExisting >= MAX_CONSECUTIVE_EXISTING && totalInserted > 0) {
              this.logger.log(
                `Caught up to existing data after ${MAX_CONSECUTIVE_EXISTING} consecutive existing kills. ` +
                `Inserted=${totalInserted}, Skipped=${totalSkipped}`,
              );
              await this.markDaysCovered(totalInserted);
              return;
            }
            continue;
          }

          consecutiveExisting = 0;

          try {
            await this.sleep(ESI_CALL_DELAY_MS);
            const { data: detail } = await this.esi.getKillmailDetail(
              kill.killmail_id,
              kill.zkb.hash,
            );

            if (!POCHVEN_SYSTEM_IDS.has(detail.solar_system_id)) {
              totalSkipped++;
              continue;
            }

            await this.killmailService.insert(
              {
                killmail_id: detail.killmail_id,
                killmail_time: detail.killmail_time,
                solar_system_id: detail.solar_system_id,
                victim: detail.victim,
                attackers: detail.attackers,
              },
              kill.zkb,
            );
            totalInserted++;

            if (totalInserted % 50 === 0) {
              this.logger.log(
                `Backfill progress: inserted=${totalInserted}, skipped=${totalSkipped}, page=${page}`,
              );
            }
          } catch (err: any) {
            if (err.message?.includes('429') || err.message?.includes('420')) {
              this.logger.warn('ESI rate limit, waiting 30s...');
              await this.sleep(30_000);
              page--;
              break;
            } else {
              this.logger.warn(`Failed to process killmail ${kill.killmail_id}: ${err.message}`);
            }
          }
        }
      }

      this.logger.log(`Backfill finished: inserted=${totalInserted}, skipped=${totalSkipped}`);
      await this.markDaysCovered(totalInserted);
    } catch (err) {
      this.logger.error('Backfill run failed', err);
    } finally {
      this.running = false;
    }
  }

  private async markDaysCovered(insertCount: number): Promise<void> {
    if (insertCount === 0) return;

    try {
      const rows: { dt: string }[] = await this.db('killmails')
        .select(this.db.raw("DATE(killmail_time) as dt"))
        .groupBy('dt')
        .orderBy('dt', 'desc')
        .limit(60);

      for (const row of rows) {
        const dateStr = new Date(row.dt).toISOString().slice(0, 10);
        await this.db('backfill_status')
          .insert({ date: dateStr, status: 'complete', completed_at: new Date() })
          .onConflict('date')
          .merge({ status: 'complete', completed_at: new Date() });
      }
    } catch (err) {
      this.logger.warn('Failed to mark days as covered', err);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
