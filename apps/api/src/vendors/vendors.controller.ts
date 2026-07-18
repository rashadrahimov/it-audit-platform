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
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
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

  @Get()
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Реестр вендоров' })
  list(@Req() req: TenantRequest) {
    return this.service.list(req.tenantId);
  }

  @Get(':id')
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Карточка вендора' })
  detail(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(req.tenantId, id);
  }
}
