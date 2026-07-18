import { BadRequestException, Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { Request } from 'express';
import { ldapLoginRequestSchema, type AuthTokenResponse } from '@it-audit/shared';
import { LdapService } from './ldap.service';

@Controller('auth/ldap')
export class LdapController {
  constructor(private readonly ldapService: LdapService) {}

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'LDAP-логин: bind в локальный AD, JIT-провижининг (T-025)' })
  @ApiOkResponse({ description: 'Bearer-токен платформы' })
  @ApiUnauthorizedResponse({ description: 'Неверные LDAP-креды' })
  login(@Body() body: unknown, @Req() req: Request): Promise<AuthTokenResponse> {
    const result = ldapLoginRequestSchema.safeParse(body ?? {});
    if (!result.success) throw new BadRequestException(result.error.issues);
    return this.ldapService.login(result.data, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
