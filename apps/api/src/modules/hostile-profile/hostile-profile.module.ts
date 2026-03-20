import { Module } from '@nestjs/common';
import { KillmailModule } from '../killmail/killmail.module';
import { HostileProfileService } from './hostile-profile.service';
import { HostileProfileController } from './hostile-profile.controller';
import { AllianceConfig } from '../../config/alliance.config';

@Module({
  imports: [KillmailModule],
  providers: [HostileProfileService, AllianceConfig],
  controllers: [HostileProfileController],
  exports: [HostileProfileService, AllianceConfig],
})
export class HostileProfileModule {}
