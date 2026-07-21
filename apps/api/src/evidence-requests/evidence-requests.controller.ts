import {
  BadRequestException,
  Body,
  Controller,
  Get,
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
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';
import { z } from 'zod';
import { DEFAULT_LOCALE, localeSchema, type Locale } from '@it-audit/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { EvidenceRequestsService } from './evidence-requests.service';

const createSchema = z.object({
  engagementId: z.uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  assigneeMembershipId: z.uuid().optional(),
  dueDate: z.iso.datetime({ offset: true }).optional(),
});
const provideSchema = z.object({ documentId: z.uuid() });

function parseLocale(localeQuery?: string): Locale {
  if (localeQuery === undefined) return DEFAULT_LOCALE;
  const parsed = localeSchema.safeParse(localeQuery);
  if (!parsed.success) throw new BadRequestException('locale: ожидается en|az|ru');
  return parsed.data;
}

@Controller('evidence-requests')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class EvidenceRequestsController {
  constructor(private readonly service: EvidenceRequestsService) {}

  @Post()
  @RequirePermission('engagement', 'view')
  @ApiOperation({ summary: 'Аудитор создаёт запрос доказательства (T-114, PBC)' })
  @ApiCreatedResponse({ description: '{id, status}' })
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.create(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      { ...parsed.data, dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null },
    );
  }

  @Post(':id/provide')
  @RequirePermission('engagement', 'view')
  @ApiOperation({ summary: 'Auditee прикладывает документ → provided' })
  @ApiOkResponse({ description: '{id, status}' })
  provide(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = provideSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.provide(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data.documentId,
    );
  }

  @Post(':id/accept')
  @RequirePermission('engagement', 'view')
  @ApiOperation({ summary: 'Аудитор принимает предоставленное доказательство → accepted' })
  @ApiOkResponse({ description: '{id, status}' })
  accept(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.accept({ tenantId: req.tenantId, userId: req.user.sub, ip: req.ip }, id);
  }

  @Get()
  @RequirePermission('engagement', 'view')
  @ApiOperation({ summary: 'Список запросов по engagement + счётчик открытых' })
  @ApiOkResponse({ description: '{open, total, items[]}' })
  list(@Req() req: TenantRequest, @Query('engagementId') engagementId?: string) {
    if (!engagementId) throw new BadRequestException('Нужен engagementId');
    return this.service.list(req.tenantId, engagementId);
  }

  @Get('suggestions')
  @RequirePermission('engagement', 'view')
  @ApiOperation({
    summary: 'T-H37: AI-assisted DRL suggestions for missing checklist evidence',
  })
  @ApiOkResponse({ description: '{count, items[]}' })
  suggestions(
    @Req() req: TenantRequest,
    @Query('engagementId') engagementId?: string,
    @Query('locale') localeQuery?: string,
  ) {
    if (!engagementId) throw new BadRequestException('Нужен engagementId');
    return this.service.suggestions(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      engagementId,
      parseLocale(localeQuery),
    );
  }
}
