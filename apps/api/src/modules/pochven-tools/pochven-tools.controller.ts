import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Req,
  ParseIntPipe,
  ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { SessionUser } from '@monipoch/shared';
import { IntelParserService } from './intel-parser.service';
import { WormholeMapperService } from './wormhole-mapper.service';
import { SubmitIntelDto, ReportWormholeDto } from '../../common/dto/pochven-tools.dto';

interface RequestWithUser extends Request {
  user: SessionUser;
}

@Controller('api/tools')
export class PochvenToolsController {
  constructor(
    private readonly intelParserService: IntelParserService,
    private readonly wormholeMapperService: WormholeMapperService,
  ) {}

  @Post('intel')
  async submitIntel(
    @Req() req: RequestWithUser,
    @Body() body: SubmitIntelDto,
  ) {
    const userId = req.user.userId;
    return this.intelParserService.parseIntelReport(
      body.text,
      userId,
      body.systemId,
    );
  }

  @Get('intel')
  async getRecentIntel() {
    return this.intelParserService.getRecentReports(50);
  }

  @Post('wormholes')
  async reportWormhole(
    @Req() req: RequestWithUser,
    @Body() body: ReportWormholeDto,
  ) {
    const userId = req.user.userId;
    const estimatedEol = body.estimatedEol ? new Date(body.estimatedEol) : undefined;
    return this.wormholeMapperService.reportConnection(
      body.fromSystemId,
      body.toSystemId,
      body.whType,
      userId,
      estimatedEol,
    );
  }

  @Get('wormholes')
  async getActiveWormholes() {
    return this.wormholeMapperService.getActiveConnections();
  }

  @Delete('wormholes/:id')
  async closeWormhole(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const userId = req.user.userId;
    const canClose = await this.wormholeMapperService.canUserClose(id, userId);
    if (!canClose) throw new ForbiddenException('You can only close wormholes you reported');
    await this.wormholeMapperService.closeConnection(id);
    return { success: true };
  }
}
