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
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { z } from 'zod';
import {
  DEFAULT_LOCALE,
  i18nTextSchema,
  localeSchema,
  riskRatingSchema,
  type Locale,
} from '@it-audit/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FindingsService } from './findings.service';

const createFindingSchema = z.object({
  engagementId: z.uuid().optional(),
  checklistItemId: z.uuid().optional(),
  responseId: z.uuid().optional(),
  controlId: z.uuid().optional(),
  titleI18n: i18nTextSchema,
  descriptionI18n: i18nTextSchema.optional(),
  riskRating: riskRatingSchema,
  recommendationI18n: i18nTextSchema.optional(),
  ownerMembershipId: z.uuid().optional(),
  auditorMembershipId: z.uuid().optional(),
  dueDate: z.iso.datetime().optional(),
  managementResponse: z.string().optional(),
});

function parseLocale(localeQuery?: string): Locale {
  if (localeQuery === undefined) return DEFAULT_LOCALE;
  const parsed = localeSchema.safeParse(localeQuery);
  if (!parsed.success) throw new BadRequestException('locale: ожидается en|az|ru');
  return parsed.data;
}

@Controller('findings')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class FindingsController {
  constructor(private readonly findingsService: FindingsService) {}

  @Post()
  @RequirePermission('finding', 'create', 'edit')
  @ApiOperation({
    summary: 'Создать finding (T-038): все колонки чеклиста клиента; standalone допустим',
  })
  @ApiCreatedResponse({ description: 'Finding в статусе identified' })
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createFindingSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.findingsService.create(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Post(':id/assign')
  @HttpCode(200)
  @RequirePermission('finding', 'edit', 'edit')
  @ApiOperation({ summary: 'Назначить owner’а (T-039): статус assigned + письмо владельцу' })
  @ApiOkResponse({ description: 'Finding назначен, письмо отправлено' })
  assign(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = z.object({ ownerMembershipId: z.uuid() }).safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.findingsService.assign(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data.ownerMembershipId,
    );
  }

  @Post(':id/transition')
  @HttpCode(200)
  @RequirePermission('finding', 'edit', 'edit')
  @ApiOperation({
    summary: 'Шаг lifecycle (T-039): строго следующий; closed через transition — только вне formal',
  })
  transition(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = z.object({ to: z.string().min(1) }).safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.findingsService.transition(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data.to,
    );
  }

  @Post(':id/retest')
  @HttpCode(200)
  @RequirePermission('finding', 'edit', 'edit')
  @ApiOperation({ summary: 'Re-test аудитором (T-039): passed → closed, failed → in_progress' })
  retest(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = z.object({ result: z.enum(['passed', 'failed']) }).safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.findingsService.retest(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data.result,
    );
  }

  @Get()
  @RequirePermission('finding', 'view')
  @ApiOperation({ summary: 'Findings тенанта; ?engagementId= — по engagement' })
  @ApiQuery({ name: 'engagementId', required: false })
  @ApiQuery({ name: 'locale', required: false })
  @ApiOkResponse({ description: '[{id, title, riskRating, status, owner, auditor, dueDate}]' })
  list(
    @Req() req: TenantRequest,
    @Query('engagementId') engagementId?: string,
    @Query('locale') localeQuery?: string,
  ) {
    return this.findingsService.list(req.tenantId, parseLocale(localeQuery), engagementId);
  }

  @Get(':id')
  @RequirePermission('finding', 'view')
  @ApiOperation({ summary: 'Карточка finding со всеми полями' })
  detail(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('locale') localeQuery?: string,
  ) {
    return this.findingsService.detail(req.tenantId, id, parseLocale(localeQuery));
  }
}
