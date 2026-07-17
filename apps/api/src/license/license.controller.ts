import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { and, eq, isNull, isNotNull, sql } from 'drizzle-orm';
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
import { AuditLogService } from '../audit/audit-log.service';
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
    private readonly auditLogService: AuditLogService,
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
    await this.auditLogService.record({
      tenantId: req.tenantId,
      actorUserId: req.user.sub,
      actorIp: req.ip,
      action: 'subsidiary.created',
      entityType: 'subsidiary',
      entityId: created?.id,
      after: created,
    });
    return { subsidiary: created, warnings: await this.licenseService.quotaWarnings(req.tenantId) };
  }

  @Delete('subsidiaries/:id')
  @HttpCode(204)
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Soft-delete дочки (T-023): обратимо, restore возвращает' })
  async softDeleteSubsidiary(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    const before = await this.dbService.withTenant(req.tenantId, async (tx) => {
      const [row] = await tx
        .update(subsidiary)
        .set({ deletedAt: sql`now()` })
        .where(and(eq(subsidiary.id, id), isNull(subsidiary.deletedAt)))
        .returning();
      return row;
    });
    if (!before) throw new NotFoundException(`Дочка ${id} не найдена или уже удалена`);
    await this.auditLogService.record({
      tenantId: req.tenantId,
      actorUserId: req.user.sub,
      actorIp: req.ip,
      action: 'subsidiary.soft_deleted',
      entityType: 'subsidiary',
      entityId: id,
    });
  }

  @Post('subsidiaries/:id/restore')
  @HttpCode(204)
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Восстановить soft-deleted дочку' })
  async restoreSubsidiary(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    const restored = await this.dbService.withTenant(req.tenantId, async (tx) => {
      const [row] = await tx
        .update(subsidiary)
        .set({ deletedAt: null })
        .where(and(eq(subsidiary.id, id), isNotNull(subsidiary.deletedAt)))
        .returning();
      return row;
    });
    if (!restored) throw new NotFoundException(`Дочка ${id} не найдена среди удалённых`);
    await this.auditLogService.record({
      tenantId: req.tenantId,
      actorUserId: req.user.sub,
      actorIp: req.ip,
      action: 'subsidiary.restored',
      entityType: 'subsidiary',
      entityId: id,
    });
  }
}
