import { Controller, Get, Req, Res } from '@nestjs/common';
import { ApiFoundResponse, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AuthTokenResponse } from '@it-audit/shared';
import { OidcService } from './oidc.service';

@Controller('auth/oidc')
export class OidcController {
  constructor(private readonly oidcService: OidcService) {}

  @Get('login')
  @ApiOperation({ summary: 'OIDC SSO: редирект на IdP (T-016)' })
  @ApiFoundResponse({ description: '302 на authorization endpoint провайдера' })
  async login(@Res() res: Response): Promise<void> {
    res.redirect(await this.oidcService.authorizationUrl());
  }

  @Get('callback')
  @ApiOperation({ summary: 'OIDC callback: обмен кода на наш JWT; JIT-провижининг по email' })
  @ApiOkResponse({ description: 'Bearer-токен платформы' })
  callback(@Req() req: Request): Promise<AuthTokenResponse> {
    // фронт (T-022+) поменяет ответ на redirect с httpOnly-cookie; для API-first — JSON
    const currentUrl = new URL(req.originalUrl, `http://${req.headers.host ?? 'localhost:3001'}`);
    return this.oidcService.handleCallback(currentUrl, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
