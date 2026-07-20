import { BadRequestException, Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation } from '@nestjs/swagger';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { SsoConfigService } from './sso-config.service';

const saveSchema = z.object({
  enabled: z.boolean().optional(),
  protocol: z.enum(['oidc', 'saml']).optional(),
  emailDomain: z.string().max(253).optional(),
  entryPoint: z.string().max(1000).optional(),
  clientId: z.string().max(500).optional(),
  clientSecret: z.string().max(2000).optional(),
});

/** T-V49: per-tenant SSO-конфиг. Секрет шифруется и наружу не отдаётся. */
@Controller('sso-config')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class SsoConfigController {
  constructor(private readonly service: SsoConfigService) {}

  @Get()
  @RequirePermission('settings', 'view')
  @ApiOperation({ summary: 'SSO-конфиг тенанта (без секрета, hasSecret=bool)' })
  get(@Req() req: TenantRequest) {
    return this.service.get(req.tenantId);
  }

  @Put()
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Изменить SSO-конфиг тенанта (пустой секрет — сохраняется)' })
  save(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = saveSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.save(req.tenantId, parsed.data);
  }
}
