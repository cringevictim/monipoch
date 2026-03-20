import { Module } from '@nestjs/common';
import { IntelParserService } from './intel-parser.service';
import { WormholeMapperService } from './wormhole-mapper.service';
import { PochvenToolsController } from './pochven-tools.controller';

@Module({
  controllers: [PochvenToolsController],
  providers: [IntelParserService, WormholeMapperService],
  exports: [IntelParserService, WormholeMapperService],
})
export class PochvenToolsModule {}
