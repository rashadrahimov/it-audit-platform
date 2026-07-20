import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { z } from 'zod';
import { DEFAULT_LOCALE, localeSchema, type Locale } from '@it-audit/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { filterParam } from '../list-filters';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { ControlsService, type ControlDetail, type ControlListItem } from './controls.service';

const updateControlSchema = z.object({
  ownerMembershipId: z.uuid().nullable().optional(),
  status: z.enum(['active', 'inactive', 'retired']).optional(),
  note: z.string().max(2000).nullable().optional(),
});

function parseLocale(localeQuery?: string): Locale {
  if (localeQuery === undefined) return DEFAULT_LOCALE;
  const parsed = localeSchema.safeParse(localeQuery);
  if (!parsed.success) throw new BadRequestException('locale: ожидается en|az|ru');
  return parsed.data;
}

@Controller('controls')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ControlsController {
  constructor(private readonly controlsService: ControlsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Библиотека контролей с маппингом на стандарты (T-031); ?tenantSlug — плюс адаптации; фильтры: ?domainCode=, ?q= (T-V16)',
  })
  @ApiQuery({ name: 'tenantSlug', required: false })
  @ApiQuery({ name: 'domainCode', required: false })
  @ApiQuery({ name: 'q', required: false, description: 'подстрока в ref/objective' })
  @ApiQuery({ name: 'locale', required: false, description: 'en|az|ru; дефолт en' })
  @ApiOkResponse({ description: '[{ref, domain, objective, question, standards[]}]' })
  list(
    @Query('tenantSlug') tenantSlug?: string,
    @Query('domainCode') domainCode?: string,
    @Query('q') q?: string,
    @Query('locale') localeQuery?: string,
  ): Promise<ControlListItem[]> {
    return this.controlsService.list(tenantSlug, parseLocale(localeQuery), {
      domainCode: filterParam(domainCode, 'domainCode'),
      q: q && q.length <= 128 ? q : undefined,
    });
  }

  @Get('summary')
  @UseGuards(PermissionGuard)
  @RequirePermission('control', 'view')
  @ApiHeader({ name: 'X-Tenant-Slug', required: true })
  @ApiOperation({ summary: 'Сводка контролей (T-V45): assigned/unassigned, % passing' })
  summary(@Req() req: TenantRequest, @Query('locale') localeQuery?: string) {
    const slug = req.headers['x-tenant-slug'];
    if (typeof slug !== 'string' || !slug) throw new BadRequestException('Нужен X-Tenant-Slug');
    return this.controlsService.summary(slug, parseLocale(localeQuery));
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('control', 'edit', 'edit')
  @ApiHeader({ name: 'X-Tenant-Slug', required: true })
  @ApiOperation({ summary: 'Назначить owner/статус/заметку (T-V45); global → адаптация' })
  update(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = updateControlSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    if (Object.keys(parsed.data).length === 0) {
      throw new BadRequestException('Нужно хотя бы одно поле');
    }
    return this.controlsService.update(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Карточка контроля (T-032): поля, owner, стандарты, history, comments',
  })
  @ApiQuery({ name: 'tenantSlug', required: false })
  @ApiQuery({ name: 'locale', required: false })
  @ApiOkResponse({
    description:
      '{ref, domain, objective, question, guidance, owner, standards[], history[], comments[]}',
  })
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('tenantSlug') tenantSlug?: string,
    @Query('locale') localeQuery?: string,
  ): Promise<ControlDetail> {
    return this.controlsService.detail(id, tenantSlug, parseLocale(localeQuery));
  }
}
