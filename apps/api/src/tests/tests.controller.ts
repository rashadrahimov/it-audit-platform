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
import { filterParam, uuidFilterParam } from '../list-filters';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { AutoTestService } from './auto-test.service';
import { TestsService } from './tests.service';

const createTestSchema = z.object({
  controlId: z.uuid(),
  titleI18n: i18nTextSchema,
  kind: z.enum(['manual', 'automated']).default('manual'),
  frequency: z.string().optional(),
  dueDate: z.iso.datetime().optional(),
  ownerMembershipId: z.uuid().optional(),
  connectorId: z.uuid().optional(),
  checkConfig: z.record(z.string(), z.unknown()).optional(),
});

const recordResultSchema = z.object({
  outcome: z.enum(['pass', 'fail', 'error']),
  failingEntities: z.array(z.unknown()).optional(),
  evidenceDocumentId: z.uuid().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

function parseLocale(localeQuery?: string): Locale {
  if (localeQuery === undefined) return DEFAULT_LOCALE;
  const parsed = localeSchema.safeParse(localeQuery);
  if (!parsed.success) throw new BadRequestException('locale: ожидается en|az|ru');
  return parsed.data;
}

@Controller('tests')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class TestsController {
  constructor(
    private readonly testsService: TestsService,
    private readonly autoTestService: AutoTestService,
  ) {}

  @Post(':id/run-auto')
  @HttpCode(200)
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({
    summary: 'Автопрогон теста через коннектор (T-050): правило check_config → test_result',
  })
  runAuto(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.autoTestService.run(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
    );
  }

  @Post()
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Создать тест контроля (T-033, ADR-0010)' })
  @ApiCreatedResponse({ description: 'Тест в статусе needs_attention' })
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createTestSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.testsService.create(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Post(':id/results')
  @HttpCode(201)
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({
    summary: 'Записать прогон: outcome двигает статус теста (pass→ok, fail→failing)',
  })
  @ApiCreatedResponse({ description: 'Результат записан, статус пересчитан' })
  recordResult(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = recordResultSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.testsService.recordResult(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data,
    );
  }

  @Get()
  @RequirePermission('control', 'view')
  @ApiOperation({
    summary:
      'Тесты тенанта; фильтры: ?controlId=, ?status=, ?kind=, ?slaStatus=, ?ownerMembershipId= (T-V16)',
  })
  @ApiQuery({ name: 'controlId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'kind', required: false })
  @ApiQuery({ name: 'slaStatus', required: false })
  @ApiQuery({ name: 'ownerMembershipId', required: false })
  @ApiQuery({ name: 'locale', required: false })
  @ApiOkResponse({ description: '[{id, title, kind, status, slaStatus, controlRef, owner}]' })
  list(
    @Req() req: TenantRequest,
    @Query('controlId') controlId?: string,
    @Query('status') status?: string,
    @Query('kind') kind?: string,
    @Query('slaStatus') slaStatus?: string,
    @Query('ownerMembershipId') ownerMembershipId?: string,
    @Query('locale') localeQuery?: string,
  ) {
    return this.testsService.list(req.tenantId, parseLocale(localeQuery), controlId, {
      status: filterParam(status, 'status'),
      kind: filterParam(kind, 'kind'),
      slaStatus: filterParam(slaStatus, 'slaStatus'),
      ownerMembershipId: uuidFilterParam(ownerMembershipId, 'ownerMembershipId'),
    });
  }

  @Get(':id')
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Карточка теста с историей прогонов' })
  detail(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('locale') localeQuery?: string,
  ) {
    return this.testsService.detail(req.tenantId, id, parseLocale(localeQuery));
  }
}
