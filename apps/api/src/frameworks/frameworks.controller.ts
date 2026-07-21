import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Query,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { z } from 'zod';
import { DEFAULT_LOCALE, localeSchema, type Locale } from '@it-audit/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FrameworksService, type FrameworkListItem } from './frameworks.service';

function parseLocale(localeQuery?: string): Locale {
  if (localeQuery === undefined) return DEFAULT_LOCALE;
  const parsed = localeSchema.safeParse(localeQuery);
  if (!parsed.success) throw new BadRequestException('locale: ожидается en|az|ru');
  return parsed.data;
}

@Controller('frameworks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class FrameworksController {
  constructor(private readonly frameworksService: FrameworksService) {}

  @Get()
  @ApiOperation({
    summary: 'Библиотека стандартов (T-030): глобальные + адаптации тенанта при ?tenantSlug',
  })
  @ApiQuery({ name: 'tenantSlug', required: false, description: 'До тенант-контекста UI: явно' })
  @ApiQuery({ name: 'locale', required: false, description: 'en|az|ru; дефолт en' })
  @ApiOkResponse({ description: '[{id, name, version, status, isGlobal}]' })
  list(
    @Query('tenantSlug') tenantSlug?: string,
    @Query('locale') localeQuery?: string,
  ): Promise<FrameworkListItem[]> {
    return this.frameworksService.list(tenantSlug, parseLocale(localeQuery));
  }

  @Get('mapping-summary')
  @ApiOperation({
    summary: 'T-H40: cross-framework compliance mapping and reusable-control coverage',
  })
  @ApiQuery({ name: 'tenantSlug', required: false })
  @ApiQuery({ name: 'locale', required: false })
  @ApiOkResponse({
    description:
      '{activeFrameworks,totalRequirements,coveredRequirements,coveragePercent,topReusableControls,byFramework}',
  })
  mappingSummary(@Query('tenantSlug') tenantSlug?: string, @Query('locale') localeQuery?: string) {
    return this.frameworksService.mappingSummary(tenantSlug, parseLocale(localeQuery));
  }

  @Get(':id/requirements')
  @ApiOperation({ summary: 'Дерево требований фреймворка (T-078, EP-FWK)' })
  @ApiQuery({ name: 'locale', required: false })
  @ApiQuery({ name: 'tenantSlug', required: false })
  @ApiOkResponse({ description: '{id, name, version, requirements:[{id, ref, title, parentId}]}' })
  requirements(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('locale') localeQuery?: string,
    @Query('tenantSlug') tenantSlug?: string,
  ) {
    return this.frameworksService.requirements(id, parseLocale(localeQuery), tenantSlug);
  }

  @Get(':id/coverage')
  @ApiOperation({ summary: 'Покрытие требований замапленными контролями (T-079, EP-FWK)' })
  @ApiQuery({ name: 'tenantSlug', required: false })
  @ApiOkResponse({ description: '{frameworkId, total, covered, percent, uncovered:[ref]}' })
  coverage(@Param('id', ParseUUIDPipe) id: string, @Query('tenantSlug') tenantSlug?: string) {
    return this.frameworksService.coverage(id, tenantSlug);
  }

  @Post(':id/activate')
  @HttpCode(200)
  @UseGuards(PermissionGuard)
  @RequirePermission('control', 'edit', 'edit')
  @ApiHeader({ name: 'X-Tenant-Slug', required: true })
  @ApiOperation({ summary: 'Активировать фреймворк для тенанта (T-V25, «Add framework»)' })
  activate(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.frameworksService.activate(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
    );
  }

  @Delete(':id/activate')
  @UseGuards(PermissionGuard)
  @RequirePermission('control', 'edit', 'edit')
  @ApiHeader({ name: 'X-Tenant-Slug', required: true })
  @ApiOperation({ summary: 'Деактивировать фреймворк тенанта (T-V25)' })
  deactivate(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.frameworksService.deactivate(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
    );
  }

  @Get(':id/evidence')
  @UseGuards(PermissionGuard)
  @RequirePermission('control', 'view')
  @ApiHeader({ name: 'X-Tenant-Slug', required: true })
  @ApiOperation({ summary: 'Evidence completeness (T-V25): % требований с документами' })
  @ApiOkResponse({ description: '{frameworkId, total, withEvidence, percent, missing:[ref]}' })
  evidence(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.frameworksService.evidence(req.tenantId, id);
  }

  @Get(':id/audits')
  @UseGuards(PermissionGuard)
  @RequirePermission('engagement', 'view')
  @ApiHeader({ name: 'X-Tenant-Slug', required: true })
  @ApiOperation({ summary: 'Audit-ends (T-V25): engagements с чеклистом по контролам фреймворка' })
  audits(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('locale') localeQuery?: string,
  ) {
    return this.frameworksService.audits(req.tenantId, id, parseLocale(localeQuery));
  }

  @Post(':id/new-version')
  @UseGuards(PermissionGuard)
  @RequirePermission('control', 'edit', 'edit')
  @ApiHeader({ name: 'X-Tenant-Slug', required: true })
  @ApiOperation({ summary: 'Новая версия фреймворка (T-V46): копия + перенос маппингов' })
  newVersion(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = z
      .object({ version: z.string().min(1).max(64), notes: z.string().max(2000).optional() })
      .safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.frameworksService.newVersion(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data,
    );
  }

  @Get(':id/diff')
  @UseGuards(PermissionGuard)
  @RequirePermission('control', 'view')
  @ApiHeader({ name: 'X-Tenant-Slug', required: true })
  @ApiOperation({ summary: 'Diff требований против предыдущей версии (T-V46)' })
  diff(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('locale') localeQuery?: string,
  ) {
    return this.frameworksService.diff(req.tenantId, id, parseLocale(localeQuery));
  }
}
