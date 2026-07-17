import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { DbService } from '../db/db.service';
import { subsidiary } from '../db/schema';
import { LicenseService } from './license.service';

const createSubsidiarySchema = z.object({
  nameI18n: z.object({
    en: z.string().min(1),
    az: z.string().optional(),
    ru: z.string().optional(),
  }),
  code: z.string().optional(),
  country: z.string().optional(),
});

@Controller()
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class LicenseController {
  constructor(
    private readonly licenseService: LicenseService,
    private readonly dbService: DbService,
  ) {}

  @Get('license/usage')
  @RequirePermission('settings', 'view')
  @ApiOperation({ summary: 'Лицензия и потребление квот (ADR-0014)' })
  @ApiOkResponse({ description: 'план, дочки used/max, audit-seats used/max' })
  usage(@Req() req: TenantRequest) {
    return this.licenseService.usage(req.tenantId);
  }

  @Post('subsidiaries')
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({
    summary: 'Создать дочку — с мягкой проверкой квоты (создаёт и предупреждает при превышении)',
  })
  @ApiCreatedResponse({ description: '{subsidiary, warnings[]}' })
  async createSubsidiary(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createSubsidiarySchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const created = await this.dbService.withTenant(req.tenantId, async (tx) => {
      const [row] = await tx
        .insert(subsidiary)
        .values({ tenantId: req.tenantId, ...parsed.data })
        .returning();
      return row;
    });
    return { subsidiary: created, warnings: await this.licenseService.quotaWarnings(req.tenantId) };
  }
}
