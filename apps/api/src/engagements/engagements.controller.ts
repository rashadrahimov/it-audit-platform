import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
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
} from '@nestjs/swagger';
import { z } from 'zod';
import {
  complianceStatusSchema,
  DEFAULT_LOCALE,
  engagementRoleSchema,
  i18nTextSchema,
  localeSchema,
  type Locale,
} from '@it-audit/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { filterParam, uuidFilterParam } from '../list-filters';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { EngagementsService } from './engagements.service';

const createEngagementSchema = z.object({
  subsidiaryId: z.uuid(),
  titleI18n: i18nTextSchema,
  auditTypeCode: z.string().optional(),
  mode: z.enum(['formal', 'light']).default('formal'),
  periodStart: z.iso.datetime().optional(),
  periodEnd: z.iso.datetime().optional(),
  custom: z.record(z.string(), z.unknown()).optional(),
  milestones: z
    .array(z.object({ stage: z.string().min(1), plannedDate: z.iso.datetime() }))
    .default([]),
});

const transitionSchema = z.object({ to: z.string().min(1) });

const addChecklistSchema = z.object({ controlIds: z.array(z.uuid()).min(1) });

const memberSchema = z.object({
  membershipId: z.uuid(),
  engagementRole: engagementRoleSchema,
  stagePermissions: z.record(z.string(), z.string()).nullable().optional(),
});

const saveResponseSchema = z.object({
  text: z.string().min(1),
  complianceStatus: complianceStatusSchema,
});

function parseLocale(localeQuery?: string): Locale {
  if (localeQuery === undefined) return DEFAULT_LOCALE;
  const parsed = localeSchema.safeParse(localeQuery);
  if (!parsed.success) throw new BadRequestException('locale: ожидается en|az|ru');
  return parsed.data;
}

@Controller('engagements')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class EngagementsController {
  constructor(private readonly engagementsService: EngagementsService) {}

  @Post()
  @RequirePermission('engagement', 'create', 'edit')
  @ApiOperation({ summary: 'Создать engagement (T-035, ADR-0005): режим formal/light + вехи' })
  @ApiCreatedResponse({ description: 'Создан в состоянии draft' })
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createEngagementSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.engagementsService.create(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Post(':id/transition')
  @HttpCode(200)
  @RequirePermission('engagement', 'edit', 'edit')
  @ApiOperation({ summary: 'Переход state machine; вход в стадию фиксирует факт вехи (ENG-03)' })
  @ApiOkResponse({ description: 'Engagement в новом состоянии' })
  transition(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = transitionSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.engagementsService.transition(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data.to,
    );
  }

  @Post(':id/checklist-items')
  @RequirePermission('engagement', 'edit', 'edit')
  @ApiOperation({
    summary: 'Чеклист (T-036): добавить контроли из библиотеки снапшотами (data-model §10.1)',
  })
  @ApiCreatedResponse({ description: '{added: n}; уже добавленные пропускаются' })
  addChecklistItems(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = addChecklistSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.engagementsService.addChecklistItems(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data.controlIds,
    );
  }

  @Post(':id/members')
  @RequirePermission('engagement', 'edit', 'edit')
  @ApiOperation({ summary: 'Состав команды (T-116): назначить участника с ролью' })
  @ApiCreatedResponse({ description: '{id, engagementRole}' })
  assignMember(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = memberSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.engagementsService.assignMember(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data,
    );
  }

  @Get(':id/members')
  @RequirePermission('engagement', 'view')
  @ApiOperation({ summary: 'Состав команды engagement (T-116)' })
  @ApiOkResponse({ description: '[{id, membershipId, engagementRole, fullName, email}]' })
  listMembers(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.engagementsService.listMembers(req.tenantId, id);
  }

  @Delete(':id/members/:memberId')
  @RequirePermission('engagement', 'edit', 'edit')
  @ApiOperation({ summary: 'Снять участника с engagement (T-116)' })
  @ApiOkResponse({ description: '{id}' })
  removeMember(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    return this.engagementsService.removeMember(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      memberId,
    );
  }

  @Put(':id/checklist-items/:itemId/response')
  @HttpCode(200)
  // под view-правом: респонденты — Collaborator'ы (engagement=view); ужесточение до
  // назначенного respondent'а придёт вместе с назначением респондентов на пункты
  @RequirePermission('engagement', 'view')
  @ApiOperation({ summary: 'Ответ респондента (T-037): upsert текста и compliance-статуса' })
  @ApiOkResponse({ description: 'Сохранённый ответ; пункт получает status=answered' })
  saveResponse(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: unknown,
  ) {
    const parsed = saveResponseSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.engagementsService.saveResponse(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      itemId,
      parsed.data,
    );
  }

  @Get()
  @RequirePermission('engagement', 'view')
  @ApiOperation({
    summary:
      'Список engagement’ов тенанта (?auditTypeCode, ?state=, ?mode=, ?subsidiaryId= — фильтры T-V16/T-V44; ?archived=true — только архив)',
  })
  list(
    @Req() req: TenantRequest,
    @Query('locale') localeQuery?: string,
    @Query('auditTypeCode') auditTypeCode?: string,
    @Query('archived') archived?: string,
    @Query('state') state?: string,
    @Query('mode') mode?: string,
    @Query('subsidiaryId') subsidiaryId?: string,
  ) {
    return this.engagementsService.list(
      req.tenantId,
      req.user.sub,
      parseLocale(localeQuery),
      auditTypeCode,
      archived === 'true',
      {
        state: filterParam(state, 'state'),
        mode: filterParam(mode, 'mode'),
        subsidiaryId: uuidFilterParam(subsidiaryId, 'subsidiaryId'),
      },
    );
  }

  @Get('workflow-summary')
  @RequirePermission('engagement', 'view')
  @ApiOperation({
    summary: 'Сводка lifecycle cockpit: фазы аудита, средний прогресс, команда и bottlenecks',
  })
  @ApiOkResponse({ description: '{total, averageProgressPercent, byPhase, topBlockers}' })
  workflowSummary(@Req() req: TenantRequest, @Query('locale') localeQuery?: string) {
    return this.engagementsService.workflowSummary(
      req.tenantId,
      req.user.sub,
      parseLocale(localeQuery),
    );
  }

  @Get(':id')
  @RequirePermission('engagement', 'view')
  @ApiOperation({
    summary: 'Карточка engagement’а: состояние, допустимые переходы, вехи план/факт',
  })
  detail(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('locale') localeQuery?: string,
  ) {
    return this.engagementsService.detail(req.tenantId, req.user.sub, id, parseLocale(localeQuery));
  }

  @Get(':id/export')
  @RequirePermission('report', 'export', 'edit')
  @ApiOperation({ summary: 'Гранулярный JSON-снимок одного аудита (T-H10, BCK-04)' })
  exportEngagement(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.engagementsService.exportEngagement(req.tenantId, id);
  }

  @Post(':id/duplicate')
  @RequirePermission('engagement', 'create', 'edit')
  @ApiOperation({ summary: 'Восстановить/дублировать аудит с новыми ID (T-H16, BCK-04)' })
  duplicate(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.engagementsService.duplicateEngagement(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
    );
  }

  @Get(':id/finding-suggestions')
  @RequirePermission('finding', 'view')
  @ApiOperation({ summary: 'Assist: черновики findings по несоответствиям без finding (T-H15)' })
  findingSuggestions(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('locale') localeQuery?: string,
  ) {
    return this.engagementsService.findingSuggestions(req.tenantId, id, parseLocale(localeQuery));
  }

  @Post(':id/finding-suggestions/:checklistItemId/reject')
  @HttpCode(200)
  @RequirePermission('finding', 'edit', 'edit')
  @ApiOperation({ summary: 'T-H77: HITL reject ИИ-черновика finding с audit-log trace' })
  rejectFindingSuggestion(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('checklistItemId', ParseUUIDPipe) checklistItemId: string,
    @Body() body: unknown,
  ) {
    const parsed = z.object({ reason: z.string().max(1000).optional() }).safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.engagementsService.rejectFindingSuggestion(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      checklistItemId,
      parsed.data,
    );
  }
}
