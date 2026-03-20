import { Controller, Get } from '@nestjs/common';
import { FleetTrackerService } from './fleet-tracker.service';

@Controller('api/intel/tactical')
export class TacticalIntelController {
  constructor(private readonly fleetTracker: FleetTrackerService) {}

  @Get('active')
  getActiveGroups() {
    return this.fleetTracker.getActiveGroups();
  }

  @Get('camps/active')
  getActiveCamps() {
    return this.fleetTracker.getActiveCamps();
  }

  @Get('roams/active')
  getActiveRoams() {
    return this.fleetTracker.getActiveRoams();
  }
}
