import { BadRequestException, Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation } from '@nestjs/swagger';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { BusinessProfileService } from './business-profile.service';

const saveSchema = z.object({
  legalName: z.string().max(500).optional(),
  jurisdiction: z.string().max(500).optional(),
  address: z.string().max(500).optional(),
  incidentContact: z.string().max(500).optional(),
  securityContact: z.string().max(500).optional(),
  idleTimeoutMin: z.number().int().min(0).max(1440).optional(),
  defaultLocale: z.enum(['en', 'az', 'ru']).optional(),
  supportAccess: z.boolean().optional(),
});

@Controller('business-profile')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class BusinessProfileController {
  constructor(private readonly service: BusinessProfileService) {}

  @Get()
  @RequirePermission('settings', 'view')
  @ApiOperation({ summary: 'Бизнес-профиль тенанта (T-V36a)' })
  get(@Req() req: TenantRequest) {
    return this.service.get(req.tenantId);
  }

  @Put()
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Изменить бизнес-профиль тенанта (T-V36a)' })
  save(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = saveSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.save(req.tenantId, parsed.data);
  }
}
