import { Controller, Get, Query, Res, Req, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { randomBytes } from 'crypto';

@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private config: ConfigService,
  ) {}

  @Get('login')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  login(@Req() req: Request, @Res() res: Response) {
    const state = randomBytes(16).toString('hex');
    (req as any).session = (req as any).session ?? {};
    res.cookie('oauth_state', state, {
      httpOnly: true,
      secure: this.config.get<string>('nodeEnv') === 'production',
      sameSite: 'lax',
      maxAge: 300_000,
    });
    const url = this.authService.getLoginUrl(state);
    return res.redirect(url);
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
