import { BadRequestException, Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation } from '@nestjs/swagger';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { SlaConfigService } from './sla-config.service';

const day = z.number().int().min(1).max(3650).optional();
const saveSchema = z.object({
  critical: day,
  high: day,
  medium: day,
  low: day,
  dueSoonDays: day,
});

@Controller('sla-config')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class SlaConfigController {
  constructor(private readonly service: SlaConfigService) {}

  @Get()
  @RequirePermission('settings', 'view')
  @ApiOperation({ summary: 'SLA-окна ремедиации тенанта по severity (T-V32)' })
  get(@Req() req: TenantRequest) {
    return this.service.configOf(req.tenantId);
  }

  @Put()
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Изменить SLA-окна тенанта (T-V32)' })
  save(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = saveSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.saveConfig(req.tenantId, parsed.data);
  }
}
