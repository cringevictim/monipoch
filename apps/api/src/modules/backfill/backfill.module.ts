import { Module } from '@nestjs/common';
import { BackfillService } from './backfill.service';
import { KillmailModule } from '../killmail/killmail.module';

@Module({
  imports: [KillmailModule],
  providers: [BackfillService],
  exports: [BackfillService],
})
export class BackfillModule {}
