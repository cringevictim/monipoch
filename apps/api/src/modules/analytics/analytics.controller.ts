import {
  Controller,
  Get,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Controller('api/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('kill-stats')
  async getKillStats(
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
    @Query('allianceId') allianceId?: string,
  ) {
    const aid = allianceId ? parseInt(allianceId, 10) : undefined;
    return this.analyticsService.getKillStats(days, aid && !isNaN(aid) ? aid : undefined);
  }

  @Get('top-pilots')
  async getTopPilots(
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('allianceId') allianceId?: string,
  ) {
    const aid = allianceId ? parseInt(allianceId, 10) : undefined;
    return this.analyticsService.getTopPilots(days, limit, aid && !isNaN(aid) ? aid : undefined);
  }

  @Get('ship-meta')
  async getShipMeta(
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('allianceId') allianceId?: string,
  ) {
    const aid = allianceId ? parseInt(allianceId, 10) : undefined;
    return this.analyticsService.getShipMeta(days, limit, aid && !isNaN(aid) ? aid : undefined);
  }

  @Get('isk-efficiency')
  async getISKEfficiency(
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
    @Query('allianceId') allianceId?: string,
  ) {
    const aid = allianceId ? parseInt(allianceId, 10) : undefined;
    return this.analyticsService.getISKEfficiency(days, aid && !isNaN(aid) ? aid : undefined);
  }

  @Get('top-losses')
  async getTopLosses(
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
    @Query('limit', new DefaultValuePipe(5), ParseIntPipe) limit: number,
    @Query('allianceId') allianceId?: string,
  ) {
    const aid = allianceId ? parseInt(allianceId, 10) : undefined;
    return this.analyticsService.getTopLosses(days, limit, aid && !isNaN(aid) ? aid : undefined);
  }

  @Get('hourly-activity')
  async getHourlyActivity(
    @Query('days', new DefaultValuePipe(1), ParseIntPipe) days: number,
    @Query('allianceId') allianceId?: string,
  ) {
    const aid = allianceId ? parseInt(allianceId, 10) : undefined;
    return this.analyticsService.getHourlyActivity(days, aid && !isNaN(aid) ? aid : undefined);
  }

  @Get('fights')
  async getFights(
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('allianceId') allianceId?: string,
  ) {
    const aid = allianceId ? parseInt(allianceId, 10) : undefined;
    return this.analyticsService.getFightSummaries(days, limit, aid && !isNaN(aid) ? aid : undefined);
  }
}
