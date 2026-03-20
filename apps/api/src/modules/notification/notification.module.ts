import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { DiscordWebhookService } from './discord-webhook.service';
import { NotificationController } from './notification.controller';

@Module({
  controllers: [NotificationController],
  providers: [NotificationService, DiscordWebhookService],
  exports: [NotificationService],
})
export class NotificationModule {}
