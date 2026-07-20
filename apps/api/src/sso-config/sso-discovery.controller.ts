import { BadRequestException, Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { ssoDiscoverRequestSchema, type SsoDiscoverResponse } from '@it-audit/shared';
import { SsoConfigService } from './sso-config.service';

/**
 * T-V49-dispatch (ADR-0023): публичный SSO-discovery до логина. По email-домену
 * говорит, использует ли организация SSO и через какой протокол/тенант. Без гарда —
 * шаг предшествует аутентификации (как /auth/login).
 */
@Controller('auth/sso')
export class SsoDiscoveryController {
  constructor(private readonly service: SsoConfigService) {}

  @Post('discover')
  @HttpCode(200)
  @ApiOperation({ summary: 'SSO по email-домену: {available, protocol?, tenantSlug?}' })
  @ApiOkResponse({ description: '{available: boolean, protocol?, tenantSlug?}' })
  discover(@Body() body: unknown): Promise<SsoDiscoverResponse> {
    const parsed = ssoDiscoverRequestSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.discoverByEmail(parsed.data.email);
  }
}
