import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LocationTrackerService } from './location-tracker.service';

@Module({
  imports: [AuthModule],
  providers: [LocationTrackerService],
  exports: [LocationTrackerService],
})
export class LocationTrackerModule {}
