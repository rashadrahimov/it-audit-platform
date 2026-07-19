import {
  BadRequestException,
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

  @Get(':id/requirements')
  @ApiOperation({ summary: 'Дерево требований фреймворка (T-078, EP-FWK)' })
  @ApiQuery({ name: 'locale', required: false })
  @ApiOkResponse({ description: '{id, name, version, requirements:[{id, ref, title, parentId}]}' })
  requirements(@Param('id', ParseUUIDPipe) id: string, @Query('locale') localeQuery?: string) {
    return this.frameworksService.requirements(id, parseLocale(localeQuery));
  }

  @Get(':id/coverage')
  @ApiOperation({ summary: 'Покрытие требований замапленными контролями (T-079, EP-FWK)' })
  @ApiOkResponse({ description: '{frameworkId, total, covered, percent, uncovered:[ref]}' })
  coverage(@Param('id', ParseUUIDPipe) id: string) {
    return this.frameworksService.coverage(id);
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
}
