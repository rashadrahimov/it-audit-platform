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
  ApiQuery,
} from '@nestjs/swagger';
import { z } from 'zod';
import { DEFAULT_LOCALE, i18nTextSchema, localeSchema, type Locale } from '@it-audit/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { PoliciesService } from './policies.service';

const createPolicySchema = z.object({
  titleI18n: i18nTextSchema,
  ownerMembershipId: z.uuid().optional(),
  approverMembershipId: z.uuid().optional(),
  renewBy: z.iso.datetime().optional(),
  frameworkIds: z.array(z.uuid()).optional(),
});

const addVersionSchema = z.object({
  documentId: z.uuid().optional(),
  changelog: z.string().optional(),
});

function parseLocale(localeQuery?: string): Locale {
  if (localeQuery === undefined) return DEFAULT_LOCALE;
  const parsed = localeSchema.safeParse(localeQuery);
  if (!parsed.success) throw new BadRequestException('locale: ожидается en|az|ru');
  return parsed.data;
}

// Право: 'settings' — политики это governance-конфигурация (как license/connectors).
// Отдельный ресурс 'policy' в каталоге прав — при расширении RBAC-матрицы.
@Controller('policies')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class PoliciesController {
  constructor(private readonly policiesService: PoliciesService) {}

  @Post()
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Создать политику (T-051, B4)' })
  @ApiCreatedResponse({ description: 'Политика в статусе draft' })
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createPolicySchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.policiesService.create(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Post(':id/versions')
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Добавить версию политики (документ из T-034); номер авто-инкремент' })
  @ApiCreatedResponse({ description: 'Версия создана' })
  addVersion(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = addVersionSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.policiesService.addVersion(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data,
    );
  }

  @Get()
  @RequirePermission('settings', 'view')
  @ApiOperation({ summary: 'Политики тенанта' })
  @ApiQuery({ name: 'locale', required: false })
  @ApiOkResponse({ description: '[{id, title, status, owner, renewBy}]' })
  list(@Req() req: TenantRequest, @Query('locale') localeQuery?: string) {
    return this.policiesService.list(req.tenantId, parseLocale(localeQuery));
  }

  @Get(':id')
  @RequirePermission('settings', 'view')
  @ApiOperation({ summary: 'Карточка политики + версии' })
  detail(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('locale') localeQuery?: string,
  ) {
    return this.policiesService.detail(req.tenantId, id, parseLocale(localeQuery));
  }
}
