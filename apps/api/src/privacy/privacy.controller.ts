import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { i18nTextSchema } from '@it-audit/shared';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { filterParam } from '../list-filters';
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
  approverMembershipId: z.uuid().optional(),
  reviewDate: z.string().optional(),
});

const createSchema = z.object({
  nameI18n: i18nTextSchema,
  legalBasis: z.enum(['consent', 'contract', 'legal_obligation', 'vital', 'public', 'legitimate']),
  purpose: z.string().optional(),
  role: z.enum(['controller', 'processor', 'joint']).optional(),
  dataCategories: z.array(z.unknown()).optional(),
  dataSubjects: z.array(z.unknown()).optional(),
  recipients: z.array(z.unknown()).optional(),
  retentionPeriod: z.string().optional(),
  crossBorder: z.boolean().optional(),
  ownerMembershipId: z.uuid().optional(),
  vendorId: z.uuid().optional(),
  dataLocations: z.array(z.string()).optional(),
  reviewOwnerMembershipId: z.uuid().optional(),
  reviewDate: z.string().optional(),
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
  transitionDpia(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = z
      .object({ to: z.enum(['in_progress', 'pending_approval', 'completed']) })
      .safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.dpia.transition(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data.to,
    );
  }

  @Post('dpia/:id/approve')
  @HttpCode(200)
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Утвердить DPIA (T-V41): только назначенный approver' })
  approveDpia(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.dpia.approve({ tenantId: req.tenantId, userId: req.user.sub, ip: req.ip }, id);
  }

  @Get('dpia')
  @RequirePermission('control', 'view')
  @ApiOperation({
    summary: 'Список DPIA тенанта (?needsMyApproval=true — очередь approver, T-V41)',
  })
  @ApiQuery({ name: 'needsMyApproval', required: false })
  listDpia(@Req() req: TenantRequest, @Query('needsMyApproval') needsMyApproval?: string) {
    return this.dpia.list(req.tenantId, {
      userId: req.user.sub,
      needsMyApproval: needsMyApproval === 'true',
    });
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

  @Post('import')
  @HttpCode(200)
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Импорт реестра ROPA из CSV (T-V55, GDPR Art.30)' })
  importCsv(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = z.object({ csv: z.string().min(1) }).safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.importCsv(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data.csv,
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
  @ApiOperation({ summary: 'Реестр операций обработки (ROPA); фильтры: ?role=, ?status= (T-V16)' })
  @ApiQuery({ name: 'role', required: false })
  @ApiQuery({ name: 'status', required: false })
  list(@Req() req: TenantRequest, @Query('role') role?: string, @Query('status') status?: string) {
    return this.service.list(req.tenantId, {
      role: filterParam(role, 'role'),
      status: filterParam(status, 'status'),
    });
  }

  @Get(':id')
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Карточка операции обработки' })
  get(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(req.tenantId, id);
  }
}
