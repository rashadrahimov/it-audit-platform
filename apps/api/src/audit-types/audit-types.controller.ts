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
import { DEFAULT_LOCALE, i18nTextSchema, localeSchema, type Locale } from '@it-audit/shared';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { AuditTypesService } from './audit-types.service';

const createSchema = z.object({
  code: z
    .string()
    .min(1)
    .regex(/^[a-z0-9_]+$/, 'code: только a-z0-9_'),
  nameI18n: i18nTextSchema,
});

const templateItemSchema = z.object({
  ref: z.string().min(1),
  objectiveI18n: i18nTextSchema,
  questionI18n: i18nTextSchema,
  order: z.number().int().optional(),
});

function parseLocale(localeQuery?: string): Locale {
  if (localeQuery === undefined) return DEFAULT_LOCALE;
  const parsed = localeSchema.safeParse(localeQuery);
  if (!parsed.success) throw new BadRequestException('locale: ожидается en|az|ru');
  return parsed.data;
}

@Controller('audit-types')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class AuditTypesController {
  constructor(private readonly service: AuditTypesService) {}

  @Get()
  @RequirePermission('engagement', 'view')
  @ApiOperation({ summary: 'Справочник типов аудита (global + кастомные тенанта, T-084)' })
  @ApiQuery({ name: 'locale', required: false })
  list(@Req() req: TenantRequest, @Query('locale') localeQuery?: string) {
    return this.service.list(req.tenantId, parseLocale(localeQuery));
  }

  @Post()
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Завести кастомный тип аудита тенанта' })
  @ApiCreatedResponse({ description: '{id, code}' })
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.create(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Post(':id/template-items')
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Добавить пункт в типо-специфичный шаблон чеклиста (T-085, UNI-06)' })
  addTemplateItem(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = templateItemSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.addTemplateItem(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data,
    );
  }

  @Get(':id/template-items')
  @RequirePermission('engagement', 'view')
  @ApiOperation({ summary: 'Шаблон чеклиста типа аудита' })
  listTemplateItems(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.listTemplateItems(req.tenantId, id);
  }

  @Post('seed-checklist/:engagementId')
  @HttpCode(200)
  @RequirePermission('engagement', 'edit', 'edit')
  @ApiOperation({ summary: 'Засеять checklist engagement из шаблона его типа (UNI-06)' })
  seedChecklist(
    @Req() req: TenantRequest,
    @Param('engagementId', ParseUUIDPipe) engagementId: string,
  ) {
    return this.service.seedChecklist(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      engagementId,
    );
  }
}
