import { Module } from '@nestjs/common';
import { PVEIntelService } from './pve-intel.service';
import { PVEIntelController } from './pve-intel.controller';

@Module({
  controllers: [PVEIntelController],
  providers: [PVEIntelService],
  exports: [PVEIntelService],
})
export class PVEIntelModule {}
