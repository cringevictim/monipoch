import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { PVEIntelService } from './pve-intel.service';

@Controller('api/pve')
export class PVEIntelController {
  constructor(private readonly pveIntelService: PVEIntelService) {}

  @Get('npc-kills')
  getLatestNPCKills() {
    return this.pveIntelService.getLatestNPCKills();
  }

  @Get('safe-systems')
  getSafeSystems() {
    return this.pveIntelService.getSafeSystemRanking();
  }

  @Get('activity/:systemId')
  getActivityTrends(
    @Param('systemId', ParseIntPipe) systemId: number,
    @Query('days') days?: string,
  ) {
    const daysNum = days ? parseInt(days, 10) : 7;
    return this.pveIntelService.getActivityTrends(systemId, daysNum);
  }

  @Get('flashpoints')
  getFlashpoints() {
    return this.pveIntelService.detectFlashpoints();
  }
}
