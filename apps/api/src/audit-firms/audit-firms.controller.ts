import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { AuditFirmsService } from './audit-firms.service';

const createFirmSchema = z.object({
  name: z.string().min(1).max(200),
  contactEmail: z.email().optional(),
  note: z.string().max(2000).optional(),
});

const setReviewSchema = z.object({
  entityType: z.enum(['response', 'document', 'vendor_assessment', 'control']),
  entityId: z.uuid(),
  status: z.enum(['not_ready', 'ready', 'flagged', 'accepted']),
  note: z.string().max(2000).nullable().optional(),
});

@Controller('audit-firms')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class AuditFirmsController {
  constructor(private readonly service: AuditFirmsService) {}

  @Get()
  @RequirePermission('settings', 'view')
  @ApiOperation({ summary: 'Реестр аудиторских фирм (T-V29)' })
  list(@Req() req: TenantRequest) {
    return this.service.listFirms(req.tenantId);
  }

  @Post()
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Добавить аудиторскую фирму (T-V29)' })
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createFirmSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.createFirm(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Delete(':id')
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Удалить аудиторскую фирму (T-V29)' })
  remove(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteFirm(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
    );
  }

  // === Evidence tracker ===

  @Get('evidence')
  @RequirePermission('engagement', 'view')
  @ApiOperation({ summary: 'Статус ревью evidence (T-V29): ?entityType=&entityId=' })
  @ApiQuery({ name: 'entityType', required: true })
  @ApiQuery({ name: 'entityId', required: true })
  review(
    @Req() req: TenantRequest,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
  ) {
    if (!entityType || !entityId) throw new BadRequestException('Нужны entityType и entityId');
    return this.service.listReviews(req.tenantId, entityType, entityId);
  }

  @Get('evidence-batch')
  @RequirePermission('engagement', 'view')
  @ApiOperation({ summary: 'Статусы ревью пачки evidence (T-V29): ?entityType=&entityIds=a,b,c' })
  @ApiQuery({ name: 'entityType', required: true })
  @ApiQuery({ name: 'entityIds', required: true, description: 'через запятую' })
  reviewBatch(
    @Req() req: TenantRequest,
    @Query('entityType') entityType?: string,
    @Query('entityIds') entityIds?: string,
  ) {
    if (!entityType || !entityIds) throw new BadRequestException('Нужны entityType и entityIds');
    const ids = entityIds
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^[0-9a-f-]{36}$/i.test(s))
      .slice(0, 200);
    return this.service.reviewsFor(req.tenantId, entityType, ids);
  }

  @Post('evidence')
  @HttpCode(200)
  @RequirePermission('engagement', 'edit', 'edit')
  @ApiOperation({ summary: 'Установить статус ревью evidence (T-V29, Auditor View)' })
  setReview(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = setReviewSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.setReview(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }
}
