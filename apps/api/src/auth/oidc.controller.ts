import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { ApiFoundResponse, ApiOkResponse, ApiOperation, ApiQuery } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { env } from '../env';
import { OidcService } from './oidc.service';
import { SsoConfigService } from './sso-config.service';
import { emailDomain } from './sso-dispatch';

const SESSION_COOKIE = 'session';

@Controller('auth/oidc')
export class OidcController {
  constructor(
    private readonly oidcService: OidcService,
    private readonly ssoConfigService: SsoConfigService,
  ) {}

  @Get('login')
  @ApiOperation({
    summary: 'OIDC SSO: редирект на IdP (T-016; V49 — ?domain= → IdP тенанта, ?mode=web)',
  })
  @ApiQuery({ name: 'domain', required: false })
  @ApiQuery({ name: 'email', required: false })
  @ApiQuery({ name: 'mode', required: false, enum: ['api', 'web'] })
  @ApiFoundResponse({ description: '302 на authorization endpoint провайдера' })
  async login(
    @Res() res: Response,
    @Query('domain') domain?: string,
    @Query('email') email?: string,
    @Query('mode') mode?: string,
  ): Promise<void> {
    // домен — из ?domain= или из ?email=; нет → глобальный env-IdP (T-016)
    const dom = domain ?? (email ? (emailDomain(email) ?? undefined) : undefined);
    const tenant = dom ? await this.ssoConfigService.oidcParamsByDomain(dom) : null;
    const url = await this.oidcService.authorizationUrl(tenant, mode === 'web' ? 'web' : 'api');
    res.redirect(url);
  }

  @Get('callback')
  @ApiOperation({ summary: 'OIDC callback: обмен кода; mode=web → cookie+redirect, иначе JSON' })
  @ApiOkResponse({ description: 'Bearer-токен (api) либо 302 на /account с сессией (web)' })
  async callback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const currentUrl = new URL(req.originalUrl, `http://${req.headers.host ?? 'localhost:3001'}`);
    const { token, mode } = await this.oidcService.handleCallback(currentUrl, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    if (mode === 'web') {
      // Завершаем в веб-сессию: cookie 'session' host-scoped (localhost → web:3000 читает),
      // затем redirect в приложение. Прод с раздельными доменами — same-origin callback (T-047).
      res.cookie(SESSION_COOKIE, token.accessToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.appUrl.startsWith('https:'),
        path: '/',
        maxAge: token.expiresInSeconds * 1000,
      });
      res.redirect(`${env.appUrl}/account`);
      return;
    }
    res.json(token);
  }
}
