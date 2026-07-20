import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation } from '@nestjs/swagger';
import { ssoConfigUpsertSchema, type SsoConfigResponse } from '@it-audit/shared';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { SsoConfigService } from './sso-config.service';

/**
 * CRUD per-tenant SSO-конфига (V49, ADR-0021): админ тенанта заводит домен→IdP.
 * Секрет IdP на запись шифруется, наружу не отдаётся. Скоуп — по tenantId из guard.
 */
@Controller('sso-config')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SsoConfigController {
  constructor(private readonly service: SsoConfigService) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('settings', 'view')
  @ApiHeader({ name: 'X-Tenant-Slug', required: true })
  @ApiOperation({ summary: 'SSO-домены тенанта (без секретов — только hasSecret)' })
  list(@Req() req: TenantRequest): Promise<SsoConfigResponse[]> {
    return this.service.list(req.tenantId);
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('settings', 'edit', 'edit')
  @ApiHeader({ name: 'X-Tenant-Slug', required: true })
  @ApiOperation({ summary: 'Завести/обновить домен→IdP (upsert по домену)' })
  upsert(@Req() req: TenantRequest, @Body() body: unknown): Promise<SsoConfigResponse> {
    const parsed = ssoConfigUpsertSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.upsert(req.tenantId, parsed.data);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('settings', 'edit', 'edit')
  @ApiHeader({ name: 'X-Tenant-Slug', required: true })
  @ApiOperation({ summary: 'Удалить SSO-домен тенанта' })
  remove(@Req() req: TenantRequest, @Param('id') id: string): Promise<{ deleted: boolean }> {
    return this.service.remove(req.tenantId, id);
  }
}
