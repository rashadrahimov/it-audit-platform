import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiConsumes, ApiFoundResponse, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AuthTokenResponse } from '@it-audit/shared';
import { SamlService } from './saml.service';

@Controller('auth/saml')
export class SamlController {
  constructor(private readonly samlService: SamlService) {}

  @Get('login')
  @ApiOperation({ summary: 'SAML SSO: редирект на IdP с AuthnRequest (T-024)' })
  @ApiFoundResponse({ description: '302 на SSO-endpoint IdP (redirect-binding)' })
  async login(@Res() res: Response): Promise<void> {
    res.redirect(await this.samlService.authorizationUrl());
  }

  @Post('callback')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('application/x-www-form-urlencoded')
  @ApiOperation({ summary: 'SAML ACS: приём SAMLResponse (POST-binding), JIT-провижининг' })
  @ApiOkResponse({ description: 'Bearer-токен платформы' })
  callback(@Body() body: Record<string, string>, @Req() req: Request): Promise<AuthTokenResponse> {
    // фронт (T-022+) поменяет ответ на redirect с httpOnly-cookie; для API-first — JSON
    return this.samlService.handleCallback(body, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
