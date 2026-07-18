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
import { TestsService } from './tests.service';

const createTestSchema = z.object({
  controlId: z.uuid(),
  titleI18n: i18nTextSchema,
  kind: z.enum(['manual', 'automated']).default('manual'),
  frequency: z.string().optional(),
  dueDate: z.iso.datetime().optional(),
  ownerMembershipId: z.uuid().optional(),
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
  constructor(private readonly testsService: TestsService) {}

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
  @ApiOperation({ summary: 'Тесты тенанта; ?controlId= — тесты контроля' })
  @ApiQuery({ name: 'controlId', required: false })
  @ApiQuery({ name: 'locale', required: false })
  @ApiOkResponse({ description: '[{id, title, kind, status, slaStatus, controlRef, owner}]' })
  list(
    @Req() req: TenantRequest,
    @Query('controlId') controlId?: string,
    @Query('locale') localeQuery?: string,
  ) {
    return this.testsService.list(req.tenantId, parseLocale(localeQuery), controlId);
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
