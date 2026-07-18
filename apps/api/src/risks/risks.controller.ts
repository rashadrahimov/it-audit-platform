import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { z } from 'zod';
import { DEFAULT_LOCALE, i18nTextSchema, localeSchema, type Locale } from '@it-audit/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { RisksService } from './risks.service';

const score = z.number().int().min(1).max(10);

const createRiskSchema = z.object({
  titleI18n: i18nTextSchema,
  descriptionI18n: i18nTextSchema.optional(),
  domain: z.string().optional(),
  category: z.string().optional(),
  inherentImpact: score.optional(),
  inherentLikelihood: score.optional(),
  residualImpact: score.optional(),
  residualLikelihood: score.optional(),
  treatment: z.enum(['mitigate', 'transfer', 'accept', 'avoid']).optional(),
  ownerMembershipId: z.uuid().optional(),
  subsidiaryId: z.uuid().optional(),
});

const matrixSchema = z.object({
  impactScale: z.number().int().min(3).max(10).optional(),
  likelihoodScale: z.number().int().min(3).max(10).optional(),
  thresholds: z.object({
    medium: z.number().int(),
    high: z.number().int(),
    critical: z.number().int(),
  }),
});

function parseLocale(localeQuery?: string): Locale {
  if (localeQuery === undefined) return DEFAULT_LOCALE;
  const parsed = localeSchema.safeParse(localeQuery);
  if (!parsed.success) throw new BadRequestException('locale: ожидается en|az|ru');
  return parsed.data;
}

// Risk — governance-домен, право 'control' (риски соседствуют с контролями RCM).
@Controller('risks')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class RisksController {
  constructor(private readonly service: RisksService) {}

  @Put('matrix')
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Настроить матрицу рисков (T-057, RSK-02): пороги классов' })
  @ApiOkResponse({ description: 'Конфиг матрицы' })
  setMatrix(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = matrixSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.setMatrix(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Post()
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Создать риск (T-057): risk_class вычисляется по матрице' })
  @ApiCreatedResponse({ description: 'Риск с вычисленным классом' })
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createRiskSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.create(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Post(':id/rescore')
  @HttpCode(200)
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Пересчитать класс риска (T-057)' })
  rescore(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = z
      .object({
        inherentImpact: score.optional(),
        inherentLikelihood: score.optional(),
        residualImpact: score.optional(),
        residualLikelihood: score.optional(),
      })
      .safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.rescore(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data,
    );
  }

  @Post(':id/controls')
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'RCM (T-058): привязать митигирующие контроли к риску' })
  linkControls(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = z.object({ controlIds: z.array(z.uuid()).min(1) }).safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.linkControls(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data.controlIds,
    );
  }

  @Get('heatmap')
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Heat map (T-058): распределение рисков по классам' })
  @ApiOkResponse({ description: '{total, inherent:{low,medium,high,critical}, residual:{…}}' })
  heatmap(@Req() req: TenantRequest) {
    return this.service.heatmap(req.tenantId);
  }

  @Get(':id/controls')
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Митигирующие контроли риска' })
  controlsOf(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.controlsOf(req.tenantId, id);
  }

  @Get()
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Реестр рисков' })
  @ApiQuery({ name: 'locale', required: false })
  list(@Req() req: TenantRequest, @Query('locale') localeQuery?: string) {
    return this.service.list(req.tenantId, parseLocale(localeQuery));
  }

  @Get(':id')
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Карточка риска' })
  detail(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('locale') localeQuery?: string,
  ) {
    return this.service.detail(req.tenantId, id, parseLocale(localeQuery));
  }
}
