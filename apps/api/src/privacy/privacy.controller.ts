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
import { PrivacyAssessmentsService } from './privacy-assessments.service';
import { ProcessingActivitiesService } from './processing-activities.service';

const dpiaCreateSchema = z.object({
  processingActivityId: z.uuid(),
  title: z.string().min(1),
  riskLevel: z.enum(['low', 'medium', 'high']).optional(),
  necessityNote: z.string().optional(),
  mitigations: z.array(z.unknown()).optional(),
});

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
  constructor(
    private readonly service: ProcessingActivitiesService,
    private readonly dpia: PrivacyAssessmentsService,
  ) {}

  @Post('dpia')
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Создать DPIA для операции обработки (T-075)' })
  @ApiCreatedResponse({ description: '{id, status, riskLevel}' })
  createDpia(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = dpiaCreateSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.dpia.create(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Post('dpia/:id/transition')
  @HttpCode(200)
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'DPIA workflow: draft→in_progress→completed' })
  transitionDpia(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = z.object({ to: z.enum(['in_progress', 'completed']) }).safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.dpia.transition(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data.to,
    );
  }

  @Get('dpia')
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Список DPIA тенанта' })
  listDpia(@Req() req: TenantRequest) {
    return this.dpia.list(req.tenantId);
  }

  @Get('dpia/:id')
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Карточка DPIA + документы' })
  getDpia(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.dpia.get(req.tenantId, id);
  }

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
