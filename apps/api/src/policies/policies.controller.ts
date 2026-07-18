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
import { DEFAULT_LOCALE, i18nTextSchema, localeSchema, type Locale } from '@it-audit/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { AttestationsService } from './attestations.service';
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
  constructor(
    private readonly policiesService: PoliciesService,
    private readonly attestationsService: AttestationsService,
  ) {}

  @Post(':id/attestations')
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Attestation-кампания (T-053): разослать approved-версию членам' })
  @ApiCreatedResponse({ description: '{versionId, sent}' })
  campaign(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = z.object({ membershipIds: z.array(z.uuid()).min(1) }).safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.attestationsService.campaign(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data.membershipIds,
    );
  }

  @Post(':id/attest')
  @HttpCode(200)
  // attest — self-action любого сотрудника-адресата (не админ-действие); control.view
  // есть у всех аудит-ролей. Отдельный «любой член тенанта» — при появлении end-user роли.
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Подтвердить ознакомление с политикой (T-053); только адресованную' })
  @ApiOkResponse({ description: '{status, attestedAt}' })
  attest(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.attestationsService.attest(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
    );
  }

  @Get(':id/attestations')
  @RequirePermission('settings', 'view')
  @ApiOperation({ summary: 'Трекинг attestation: кто подтвердил / кто нет' })
  @ApiOkResponse({ description: '{version, total, attested, rows[]}' })
  attestationStatus(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('locale') localeQuery?: string,
  ) {
    return this.attestationsService.status(req.tenantId, id, parseLocale(localeQuery));
  }

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

  @Post(':id/submit')
  @HttpCode(200)
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Workflow (T-052): отправить на ревью (draft→in_review) или archive' })
  @ApiOkResponse({ description: '{before, after}' })
  submit(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = z.object({ action: z.enum(['submit', 'archive']) }).safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.policiesService.transition(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data.action,
    );
  }

  // approve/reject — под settings.view (пресет-роль Approver его имеет): реальная
  // авторизация в сервисе по approver_membership (workflow-роль ортогональна RBAC).
  @Post(':id/decision')
  @HttpCode(200)
  @RequirePermission('settings', 'view')
  @ApiOperation({ summary: 'Workflow (T-052): решение approver — approve/reject (in_review)' })
  @ApiOkResponse({ description: '{before, after}' })
  decision(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = z.object({ action: z.enum(['approve', 'reject']) }).safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.policiesService.transition(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data.action,
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
