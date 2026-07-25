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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiHeader, ApiOperation } from '@nestjs/swagger';
import { z } from 'zod';
import { DEFAULT_LOCALE, i18nTextSchema, localeSchema, type Locale } from '@it-audit/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import {
  INCIDENT_CATEGORIES,
  INCIDENT_LINK_TYPES,
  INCIDENT_SEVERITIES,
  INCIDENT_SOURCES,
  INCIDENT_STATUSES,
} from './incident-flow';
import { IncidentsService } from './incidents.service';

function parseLocale(localeQuery?: string): Locale {
  if (localeQuery === undefined) return DEFAULT_LOCALE;
  const parsed = localeSchema.safeParse(localeQuery);
  if (!parsed.success) throw new BadRequestException('locale: ожидается en|az|ru');
  return parsed.data;
}

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  severity: z.enum(INCIDENT_SEVERITIES).optional(),
  category: z.enum(INCIDENT_CATEGORIES).optional(),
  source: z.enum(INCIDENT_SOURCES).optional(),
  detectedAt: z.string().optional(),
  commanderMembershipId: z.uuid().optional(),
});

const transitionSchema = z.object({
  to: z.enum(INCIDENT_STATUSES),
  note: z.string().optional(),
});

/** Ручная запись в таймлайн: заметка или предпринятое действие. */
const eventSchema = z.object({
  kind: z.enum(['note', 'action']).optional(),
  note: z.string().min(1),
});

/** T-IR03: назначение incident commander. */
const assignSchema = z.object({
  commanderMembershipId: z.uuid(),
});

/** T-IR04: постмортем — причины, влияние, уроки. */
const postmortemSchema = z.object({
  rootCause: z.string().optional(),
  impactSummary: z.string().optional(),
  lessonsLearned: z.string().optional(),
});

/** T-IR04: корректирующее действие — finding из инцидента. */
const followUpSchema = z.object({
  titleI18n: i18nTextSchema,
  riskRating: z.enum(['critical', 'high', 'medium', 'low', 'not_applicable']),
  recommendationI18n: i18nTextSchema.optional(),
  ownerMembershipId: z.uuid().optional(),
  dueDate: z.string().optional(),
});

const linkSchema = z.object({
  entityType: z.enum(INCIDENT_LINK_TYPES),
  entityId: z.uuid(),
});

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  severity: z.enum(INCIDENT_SEVERITIES).optional(),
  category: z.enum(INCIDENT_CATEGORIES).nullable().optional(),
  commanderMembershipId: z.uuid().nullable().optional(),
  /** T-IR05: подлежит уведомлению регулятора (IR-02/CBAR, breach). */
  reportable: z.boolean().optional(),
  regulator: z.string().nullable().optional(),
});

/** T-IR05: отметка «регулятор уведомлён». */
const notifySchema = z.object({
  note: z.string().optional(),
});

/** Инциденты ИБ (T-IR01, EP-INC, ADR-0024). Права — control.view / control.edit. */
@Controller('incidents')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class IncidentsController {
  constructor(private readonly service: IncidentsService) {}

  @Post()
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Зафиксировать инцидент (T-IR01)' })
  @ApiCreatedResponse({ description: 'Инцидент в статусе detected, номер INC-NNNN' })
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.create(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Post(':id/transition')
  @HttpCode(200)
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({
    summary: 'Фаза реагирования: detected→triaged→contained→eradicated→recovered→closed',
  })
  transition(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = transitionSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.transition(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data.to,
      parsed.data.note,
    );
  }

  @Post(':id/events')
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Запись в таймлайн инцидента (заметка/действие)' })
  addEvent(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = eventSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.addEvent(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data.kind ?? 'note',
      parsed.data.note,
    );
  }

  @Post(':id/assign')
  @HttpCode(200)
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Назначить incident commander (T-IR03) — с уведомлением' })
  assign(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = assignSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.assign(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data.commanderMembershipId,
    );
  }

  @Post(':id/notify')
  @HttpCode(200)
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Отметить уведомление регулятора (T-IR05, IR-02/CBAR)' })
  notify(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = notifySchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.recordNotification(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data.note,
    );
  }

  @Post(':id/postmortem')
  @HttpCode(200)
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Постмортем: причины, влияние, уроки (T-IR04, с фазы recovered)' })
  postmortem(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = postmortemSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.savePostmortem(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data,
    );
  }

  @Post(':id/follow-up')
  @RequirePermission('finding', 'create', 'edit')
  @ApiOperation({ summary: 'Корректирующее действие: finding из инцидента (T-IR04)' })
  @ApiCreatedResponse({ description: 'Finding создан и связан с инцидентом' })
  followUp(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = followUpSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.createFollowUpFinding(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data,
    );
  }

  @Post(':id/links')
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({
    summary:
      'Связать инцидент с сущностью (T-IR02): alert/vuln/asset/device/risk/control/vendor/finding',
  })
  addLink(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = linkSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.addLink(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data.entityType,
      parsed.data.entityId,
    );
  }

  @Delete(':id/links/:linkId')
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Убрать связь инцидента' })
  removeLink(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
  ) {
    return this.service.removeLink(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      linkId,
    );
  }

  @Patch(':id')
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Правка инцидента (severity меняет дедлайн резолюции)' })
  update(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = updateSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.update(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data,
    );
  }

  @Get()
  @RequirePermission('control', 'view')
  @ApiOperation({
    summary: 'Инциденты тенанта (фильтры: status/severity/category/commander, mine=true — мои)',
  })
  list(
    @Req() req: TenantRequest,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('category') category?: string,
    @Query('commanderMembershipId') commanderMembershipId?: string,
    @Query('mine') mine?: string,
  ) {
    return this.service.list(
      req.tenantId,
      { status, severity, category, commanderMembershipId, mine: mine === 'true' },
      req.user.sub,
    );
  }

  @Get(':id')
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Карточка инцидента: фазы, таймлайн, связи, доступные переходы' })
  detail(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('locale') localeQuery?: string,
  ) {
    return this.service.detail(req.tenantId, id, parseLocale(localeQuery));
  }
}
