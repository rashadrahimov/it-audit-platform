import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { filterParam } from '../list-filters';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { VendorAssessmentsService } from './vendor-assessments.service';
import { VendorsService } from './vendors.service';

const riskClass = z.enum(['low', 'medium', 'high', 'critical']);

const createVendorSchema = z.object({
  name: z.string().min(1),
  category: z.string().optional(),
  url: z.string().optional(),
  inherentRisk: riskClass.optional(),
  residualRisk: riskClass.optional(),
  securityOwnerMembershipId: z.uuid().optional(),
  intake: z.record(z.string(), z.unknown()).optional(),
});

// T-V13: частичное редактирование карточки вендора (статус — отдельным transition)
const updateVendorSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  inherentRisk: riskClass.nullable().optional(),
  residualRisk: riskClass.nullable().optional(),
  securityOwnerMembershipId: z.uuid().nullable().optional(),
  intake: z.record(z.string(), z.unknown()).optional(),
});

@Controller('vendors')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class VendorsController {
  constructor(
    private readonly service: VendorsService,
    private readonly assessments: VendorAssessmentsService,
  ) {}

  @Post(':id/assessments')
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Создать оценку вендора (T-061)' })
  @ApiCreatedResponse({ description: 'Assessment в состоянии requested' })
  createAssessment(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = z
      .object({
        type: z.string().optional(),
        dueDate: z.iso.datetime().optional(),
        ownerMembershipId: z.uuid().optional(),
      })
      .safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.assessments.create(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data,
    );
  }

  @Post('assessments/:assessmentId/transition')
  @HttpCode(200)
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Workflow оценки (T-061): requested→in_progress→completed' })
  transitionAssessment(
    @Req() req: TenantRequest,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Body() body: unknown,
  ) {
    const parsed = z
      .object({ to: z.enum(['in_progress', 'completed']), recommendation: z.string().optional() })
      .safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.assessments.transition(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      assessmentId,
      parsed.data.to,
      parsed.data.recommendation,
    );
  }

  @Get(':id/assessments')
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Оценки вендора (с документами)' })
  listAssessments(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.assessments.listForVendor(req.tenantId, id);
  }

  @Post()
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Создать вендора (T-060, B5)' })
  @ApiCreatedResponse({ description: 'Вендор в статусе procurement' })
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createVendorSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.create(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Post(':id/transition')
  @HttpCode(200)
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Lifecycle вендора (T-060): procurement→active→archived' })
  transition(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = z.object({ to: z.enum(['active', 'archived']) }).safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.transition(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data.to,
    );
  }

  @Patch(':id')
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Редактировать вендора (T-V13): атрибуты/риски/owner/intake' })
  update(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = updateVendorSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    if (Object.keys(parsed.data).length === 0) {
      throw new BadRequestException('Нужно хотя бы одно поле');
    }
    return this.service.update(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data,
    );
  }

  @Get('analytics')
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Аналитика вендоров (T-V13): счётчики по категориям/рискам/статусам' })
  analytics(@Req() req: TenantRequest) {
    return this.service.analytics(req.tenantId);
  }

  @Get()
  @RequirePermission('control', 'view')
  @ApiOperation({
    summary: 'Реестр вендоров; фильтры: ?status=, ?category=, ?inherentRisk= (T-V16)',
  })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'inherentRisk', required: false })
  list(
    @Req() req: TenantRequest,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('inherentRisk') inherentRisk?: string,
  ) {
    return this.service.list(req.tenantId, {
      status: filterParam(status, 'status'),
      category: filterParam(category, 'category'),
      inherentRisk: filterParam(inherentRisk, 'inherentRisk'),
    });
  }

  @Get(':id')
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Карточка вендора' })
  detail(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(req.tenantId, id);
  }
}
