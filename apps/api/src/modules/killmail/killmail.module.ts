import { Module } from '@nestjs/common';
import { KillmailService } from './killmail.service';
import { KillmailIngestionService } from './killmail-ingestion.service';

@Module({
  providers: [KillmailService, KillmailIngestionService],
  exports: [KillmailService, KillmailIngestionService],
})
export class KillmailModule {}
