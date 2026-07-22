import { BadRequestException, Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { DEFAULT_LOCALE, localeSchema, type Locale } from '@it-audit/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { SearchService } from './search.service';

function parseLocale(localeQuery?: string): Locale {
  if (localeQuery === undefined) return DEFAULT_LOCALE;
  const parsed = localeSchema.safeParse(localeQuery);
  if (!parsed.success) throw new BadRequestException('locale: ожидается en|az|ru');
  return parsed.data;
}

@Controller('search')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class SearchController {
  constructor(private readonly service: SearchService) {}

  @Get()
  @RequirePermission('engagement', 'view')
  @ApiOperation({ summary: 'Глобальный поиск по сущностям (T-094, GEN-05)' })
  @ApiQuery({ name: 'q', required: true })
  @ApiOkResponse({ description: '{query, hits:[{type, id, label, snippet}]}' })
  search(@Req() req: TenantRequest, @Query('q') q?: string) {
    if (!q) throw new BadRequestException('Нужен параметр q');
    return this.service.search(req.tenantId, q);
  }

  @Get('ask')
  @RequirePermission('engagement', 'view')
  @ApiOperation({
    summary:
      'T-H38/T-H69: conversational audit query over findings and evidence (deterministic, explainable)',
  })
  @ApiQuery({ name: 'q', required: true })
  @ApiQuery({ name: 'locale', required: false })
  @ApiOkResponse({
    description: '{query, interpreted, answer, count, evidenceCount, hits[], evidenceHits[]}',
  })
  ask(@Req() req: TenantRequest, @Query('q') q?: string, @Query('locale') localeQuery?: string) {
    if (!q) throw new BadRequestException('Нужен параметр q');
    return this.service.askFindings(req.tenantId, q, parseLocale(localeQuery));
  }
}
