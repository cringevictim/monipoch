import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Req,
  ParseIntPipe,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { SessionUser } from '@monipoch/shared';
import { NotificationService } from './notification.service';
import { DiscordWebhookService } from './discord-webhook.service';
import type { CreateRuleDto, UpdateRuleDto } from './notification.service';
import {
  CreateRuleBodyDto,
  UpdateRuleBodyDto,
  SetDiscordWebhookDto,
  TestDiscordWebhookDto,
  UpdateSoundPreferencesDto,
} from '../../common/dto/notification.dto';

interface RequestWithUser extends Request {
  user: SessionUser;
}

@Controller('api/notifications')
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly discordWebhookService: DiscordWebhookService,
  ) {}

  @Get('rules')
  async getRules(@Req() req: RequestWithUser) {
    const userId = req.user.userId;
    return this.notificationService.getRules(userId);
  }

  @Post('rules')
  async createRule(
    @Req() req: RequestWithUser,
    @Body() body: CreateRuleBodyDto,
  ) {
    const userId = req.user.userId;
    const dto: CreateRuleDto = {
      eventType: body.eventType,
      conditions: body.conditions,
      browserNotify: body.browserNotify,
      discordNotify: body.discordNotify,
    };
    return this.notificationService.createRule(userId, dto);
  }

  @Put('rules/:id')
  async updateRule(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateRuleBodyDto,
  ) {
    const userId = req.user.userId;
    const dto: UpdateRuleDto = {
      eventType: body.eventType,
      conditions: body.conditions,
      enabled: body.enabled,
      browserNotify: body.browserNotify,
      discordNotify: body.discordNotify,
    };
    const rule = await this.notificationService.updateRule(id, userId, dto);
    if (!rule) throw new NotFoundException('Rule not found');
    return rule;
  }

  @Delete('rules/:id')
  async deleteRule(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const userId = req.user.userId;
    const deleted = await this.notificationService.deleteRule(id, userId);
    if (!deleted) throw new NotFoundException('Rule not found');
    return { success: true };
  }

  @Get('discord')
  async getDiscordWebhook(@Req() req: RequestWithUser) {
    const userId = req.user.userId;
    const webhook = await this.discordWebhookService.getWebhook(userId);
    if (!webhook) return null;
    return {
      id: webhook.id,
      name: webhook.name,
      configured: true,
      eventTypes: webhook.event_types
        ? (typeof webhook.event_types === 'string'
            ? JSON.parse(webhook.event_types)
            : webhook.event_types)
        : [],
      enabled: webhook.enabled,
    };
  }

  @Post('discord')
  async setDiscordWebhook(
    @Req() req: RequestWithUser,
    @Body() body: SetDiscordWebhookDto,
  ) {
    const userId = req.user.userId;
    await this.discordWebhookService.setWebhook(
      userId,
      body.url,
      body.name,
      body.eventTypes ?? [],
    );
    return { success: true };
  }

  @Post('discord/test')
  async testDiscordWebhook(
    @Req() req: RequestWithUser,
    @Body() body: TestDiscordWebhookDto,
  ) {
    const userId = req.user.userId;
    let webhookUrl = body?.url;
    if (!webhookUrl) {
      const webhook = await this.discordWebhookService.getWebhook(userId);
      if (!webhook) {
        return { success: false, message: 'No webhook configured' };
      }
      webhookUrl = webhook.webhook_url;
    }
    const success = await this.discordWebhookService.testWebhook(webhookUrl);
    return { success };
  }

  @Get('sounds')
  async getSoundPreferences(@Req() req: RequestWithUser) {
    return this.notificationService.getSoundPreferences(req.user.userId);
  }

  @Put('sounds')
  async setSoundPreferences(
    @Req() req: RequestWithUser,
    @Body() body: UpdateSoundPreferencesDto,
  ) {
    return this.notificationService.setSoundPreferences(req.user.userId, body);
  }
}
