import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
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

// T-V12: частичное редактирование карточки риска (скоринг — отдельным rescore)
const updateRiskSchema = z.object({
  titleI18n: i18nTextSchema.optional(),
  descriptionI18n: i18nTextSchema.optional(),
  domain: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  treatment: z.enum(['mitigate', 'transfer', 'accept', 'avoid']).nullable().optional(),
  status: z.enum(['open', 'in_progress', 'closed']).optional(),
  ownerMembershipId: z.uuid().nullable().optional(),
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

  @Post(':id/entities')
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'T-066: привязать риск к узлам audit universe' })
  linkEntities(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = z.object({ entityIds: z.array(z.uuid()).min(1) }).safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.linkEntities(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data.entityIds,
    );
  }

  @Get(':id/entities')
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Узлы universe, затрагиваемые риском' })
  entitiesOf(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.entitiesOf(req.tenantId, id);
  }

  @Get('heatmap')
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Heat map (T-058): распределение рисков по классам' })
  @ApiOkResponse({ description: '{total, inherent:{low,medium,high,critical}, residual:{…}}' })
  heatmap(@Req() req: TenantRequest) {
    return this.service.heatmap(req.tenantId);
  }

  @Get('matrix')
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Текущая матрица рисков (T-V12): шкалы и пороги классов' })
  @ApiOkResponse({ description: '{impactScale, likelihoodScale, thresholds}' })
  getMatrix(@Req() req: TenantRequest) {
    return this.service.getMatrix(req.tenantId);
  }

  @Get('library')
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Библиотека risk-сценариев (T-V23): глобальный каталог + added' })
  @ApiQuery({ name: 'locale', required: false })
  library(@Req() req: TenantRequest, @Query('locale') localeQuery?: string) {
    return this.service.library(req.tenantId, parseLocale(localeQuery));
  }

  @Post('library/:id/add')
  @HttpCode(200)
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: '«Add to register» (T-V23): сценарий → реестр тенанта' })
  addFromLibrary(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.addFromLibrary(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
    );
  }

  @Patch(':id')
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Редактировать риск (T-V12): treatment/статус/owner/атрибуты' })
  update(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = updateRiskSchema.safeParse(body ?? {});
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

  @Delete(':id')
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Удалить риск (T-V12): soft delete' })
  remove(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove({ tenantId: req.tenantId, userId: req.user.sub, ip: req.ip }, id);
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
