import { Module } from '@nestjs/common';
import { FleetTrackerService } from './fleet-tracker.service';
import { TacticalIntelController } from './tactical-intel.controller';

@Module({
  providers: [FleetTrackerService],
  controllers: [TacticalIntelController],
  exports: [FleetTrackerService],
})
export class TacticalIntelModule {}
