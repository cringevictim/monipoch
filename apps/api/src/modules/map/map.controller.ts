import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { MapService } from './map.service';

@Controller('api/map')
export class MapController {
  constructor(private mapService: MapService) {}

  @Get('topology')
  getTopology() {
    return this.mapService.getTopology();
  }

  @Get('heatmap')
  getHeatmap() {
    return this.mapService.getHeatmap();
  }

  @Get('fights/active')
  getActiveFights() {
    return this.mapService.getActiveFights();
  }

  @Get('system/:systemId/kills')
  getSystemKills(
    @Param('systemId', ParseIntPipe) systemId: number,
    @Query('hours') hours?: string,
  ) {
    return this.mapService.getSystemKills(systemId, hours ? parseInt(hours, 10) : 24);
  }
}
