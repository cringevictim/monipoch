import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  DefaultValuePipe,
  ParseEnumPipe,
} from '@nestjs/common';
import { HostileProfileService } from './hostile-profile.service';

type SortOption = 'threat_score' | 'last_seen' | 'total_kills';
type EntityType = 'character' | 'corporation' | 'alliance';

@Controller('api/intel/hostiles')
export class HostileProfileController {
  constructor(private readonly hostileProfileService: HostileProfileService) {}

  @Get()
  async getHostiles(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query(
      'sort',
      new DefaultValuePipe('threat_score'),
      new ParseEnumPipe({
        enum: ['threat_score', 'last_seen', 'total_kills'],
        optional: true,
      }),
    )
    sort: SortOption,
    @Query('entityType', new ParseEnumPipe({
      enum: ['character', 'corporation', 'alliance'],
      optional: true,
    }))
    entityType?: EntityType,
  ) {
    return this.hostileProfileService.getHostiles(
      page,
      limit,
      sort,
      entityType,
    );
  }

  @Get('active')
  async getActiveHostiles(
    @Query('hours', new DefaultValuePipe(2), ParseIntPipe) hours: number,
  ) {
    return this.hostileProfileService.getActiveHostiles(hours);
  }

  @Get('top-threats')
  async getTopThreats(
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.hostileProfileService.getTopThreats(limit);
  }

  @Get(':entityId')
  async getHostileDetail(
    @Param('entityId', ParseIntPipe) entityId: number,
    @Query('entityType', new ParseEnumPipe({
      enum: ['character', 'corporation', 'alliance'],
      optional: true,
    }))
    entityType?: EntityType,
  ) {
    return this.hostileProfileService.getHostileDetail(entityId, entityType);
  }
}
