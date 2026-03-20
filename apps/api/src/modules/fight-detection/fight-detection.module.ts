import { Module } from '@nestjs/common';
import { FightDetectionService } from './fight-detection.service';

@Module({
  providers: [FightDetectionService],
  exports: [FightDetectionService],
})
export class FightDetectionModule {}
