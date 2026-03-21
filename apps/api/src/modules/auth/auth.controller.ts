import { Controller, Get, Query, Res, Req, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService, REQUIRED_ESI_SCOPES } from './auth.service';
import { Public } from './public.decorator';
import { randomBytes } from 'crypto';
import type { SessionUser } from '@monipoch/shared';

@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private config: ConfigService,
    private jwtService: JwtService,
  ) {}

  @Get('login')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  login(@Req() req: Request, @Res() res: Response) {
    if (this.config.get<boolean>('debug')) {
      return res.redirect('/auth/debug-login');
    }

    const state = randomBytes(16).toString('hex');
    res.cookie('oauth_state', state, {
      httpOnly: true,
      secure: this.config.get<string>('nodeEnv') === 'production',
      sameSite: 'lax',
      maxAge: 300_000,
    });
    const url = this.authService.getLoginUrl(state);
    return res.redirect(url);
  }

  @Get('debug-login')
  async debugLogin(@Res() res: Response) {
    if (!this.config.get<boolean>('debug')) {
      throw new NotFoundException();
    }

    const payload: SessionUser = {
      userId: 0,
      character: {
        characterId: 96491572,
        characterName: 'Debug Pilot',
        corporationId: 98000001,
        corporationName: 'Debug Corp',
        allianceId: this.config.get<number>('eve.allowedAllianceId') ?? 0,
        allianceName: 'Debug Alliance',
        portraitUrl: 'https://images.evetech.net/characters/96491572/portrait?size=128',
      },
      scopes: [...REQUIRED_ESI_SCOPES],
    };

    const token = this.jwtService.sign(payload);
    const frontendUrl = this.config.get<string>('frontendUrl') || 'http://localhost:5173';

    return res.redirect(
      `${frontendUrl}/auth/success?token=${encodeURIComponent(token)}&name=${encodeURIComponent(payload.character.characterName)}`,
    );
  }

  @Get('callback')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!code) throw new UnauthorizedException('Missing authorization code');

    const storedState = req.cookies?.oauth_state;
    if (!state || !storedState || state !== storedState) {
      throw new UnauthorizedException('Invalid OAuth state');
    }

    res.clearCookie('oauth_state');

    try {
      const { token, character } = await this.authService.handleCallback(code);

      const frontendUrl =
        this.config.get<string>('frontendUrl') ||
        (this.config.get<string>('nodeEnv') === 'production' ? '/' : 'http://localhost:5173');

      return res.redirect(
        `${frontendUrl}/auth/success?token=${encodeURIComponent(token)}&name=${encodeURIComponent(character.characterName)}`,
      );
    } catch (err: any) {
      const frontendUrl =
        this.config.get<string>('frontendUrl') ||
        (this.config.get<string>('nodeEnv') === 'production' ? '/' : 'http://localhost:5173');

      if (err?.message === 'SCOPES_MISSING') {
        return res.redirect(`${frontendUrl}/login?error=scopes`);
      }
      if (err?.message === 'ALLIANCE_DENIED') {
        return res.redirect('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      }
      throw err;
    }
  }

  @Get('me')
  async me() {
    return { message: 'Protected route - implement with guard' };
  }
}
