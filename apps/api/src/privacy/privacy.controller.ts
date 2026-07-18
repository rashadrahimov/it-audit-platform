import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiHeader, ApiOperation } from '@nestjs/swagger';
import { i18nTextSchema } from '@it-audit/shared';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { ProcessingActivitiesService } from './processing-activities.service';

const createSchema = z.object({
  nameI18n: i18nTextSchema,
  legalBasis: z.enum([
    'consent',
    'contract',
    'legal_obligation',
    'vital',
    'public',
    'legitimate',
  ]),
  purpose: z.string().optional(),
  role: z.enum(['controller', 'processor', 'joint']).optional(),
  dataCategories: z.array(z.unknown()).optional(),
  dataSubjects: z.array(z.unknown()).optional(),
  recipients: z.array(z.unknown()).optional(),
  retentionPeriod: z.string().optional(),
  crossBorder: z.boolean().optional(),
  ownerMembershipId: z.uuid().optional(),
});

@Controller('processing-activities')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class PrivacyController {
  constructor(private readonly service: ProcessingActivitiesService) {}

  @Post()
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Создать операцию обработки ПДн (T-074, ROPA, GDPR Art.30)' })
  @ApiCreatedResponse({ description: '{id, status}' })
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.create(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Post(':id/archive')
  @HttpCode(200)
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Архивировать операцию обработки' })
  archive(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.archive({ tenantId: req.tenantId, userId: req.user.sub, ip: req.ip }, id);
  }

  @Get()
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Реестр операций обработки (ROPA)' })
  list(@Req() req: TenantRequest) {
    return this.service.list(req.tenantId);
  }

  @Get(':id')
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Карточка операции обработки' })
  get(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(req.tenantId, id);
  }
}
