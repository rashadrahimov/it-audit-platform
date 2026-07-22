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
import { filterParam, uuidFilterParam } from '../list-filters';
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
  aiReview: z
    .object({
      source: z.literal('finding_suggestion'),
      decision: z.literal('accepted').default('accepted'),
      confidence: z.number().min(0).max(1),
      expected: z.string().min(1).max(4000),
      observed: z.string().min(1).max(4000),
      reason: z.string().max(4000).optional(),
      controlClause: z.string().max(1000).optional(),
      riskJustification: z.string().max(2000).optional(),
      evidenceReferences: z
        .array(
          z.object({
            documentId: z.uuid(),
            filename: z.string().min(1).max(500),
            relation: z.string().min(1).max(80),
            location: z.string().min(1).max(300),
          }),
        )
        .max(20)
        .default([]),
    })
    .optional(),
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

  @Get('templates')
  @RequirePermission('finding', 'view')
  @ApiOperation({
    summary: 'Библиотека шаблонов findings (T-V28): preset title/risk/recommendation',
  })
  templates(@Query('locale') localeQuery?: string) {
    return this.findingsService.templates(parseLocale(localeQuery));
  }

  @Post('from-template')
  @RequirePermission('finding', 'create', 'edit')
  @ApiOperation({ summary: 'Создать finding из шаблона (T-V28): identified с preset-полями' })
  @ApiCreatedResponse({ description: 'Finding в статусе identified' })
  createFromTemplate(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = z.object({ templateKey: z.string().min(1).max(64) }).safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.findingsService.createFromTemplate(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data.templateKey,
    );
  }

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
  @ApiOperation({
    summary:
      'Findings тенанта; фильтры: ?engagementId=, ?status=, ?riskRating=, ?slaStatus=, ?ownerMembershipId= (T-V16)',
  })
  @ApiQuery({ name: 'engagementId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'riskRating', required: false })
  @ApiQuery({ name: 'slaStatus', required: false })
  @ApiQuery({ name: 'ownerMembershipId', required: false })
  @ApiQuery({ name: 'locale', required: false })
  @ApiOkResponse({ description: '[{id, title, riskRating, status, owner, auditor, dueDate}]' })
  async list(
    @Req() req: TenantRequest,
    @Query('engagementId') engagementId?: string,
    @Query('status') status?: string,
    @Query('riskRating') riskRating?: string,
    @Query('slaStatus') slaStatus?: string,
    @Query('ownerMembershipId') ownerMembershipId?: string,
    @Query('mine') mine?: string,
    @Query('tagId') tagId?: string,
    @Query('locale') localeQuery?: string,
  ) {
    // T-V17: ?mine=true — очередь «Owned by me» (owner = membership текущего юзера)
    let owner = uuidFilterParam(ownerMembershipId, 'ownerMembershipId');
    if (mine === 'true') {
      owner = (await this.findingsService.membershipOf(req.user.sub, req.tenantId)) ?? owner;
      if (!owner) return [];
    }
    return this.findingsService.list(
      req.tenantId,
      req.user.sub,
      parseLocale(localeQuery),
      engagementId,
      {
        status: filterParam(status, 'status'),
        riskRating: filterParam(riskRating, 'riskRating'),
        slaStatus: filterParam(slaStatus, 'slaStatus'),
        ownerMembershipId: owner,
        tagId: uuidFilterParam(tagId, 'tagId'),
      },
    );
  }

  @Get(':id')
  @RequirePermission('finding', 'view')
  @ApiOperation({ summary: 'Карточка finding со всеми полями' })
  detail(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('locale') localeQuery?: string,
  ) {
    return this.findingsService.detail(req.tenantId, req.user.sub, id, parseLocale(localeQuery));
  }
}
