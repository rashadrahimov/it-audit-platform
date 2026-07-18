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
} from '@nestjs/swagger';
import { z } from 'zod';
import { DEFAULT_LOCALE, i18nTextSchema, localeSchema, type Locale } from '@it-audit/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
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
  milestones: z
    .array(z.object({ stage: z.string().min(1), plannedDate: z.iso.datetime() }))
    .default([]),
});

const transitionSchema = z.object({ to: z.string().min(1) });

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

  @Get()
  @RequirePermission('engagement', 'view')
  @ApiOperation({ summary: 'Список engagement’ов тенанта' })
  list(@Req() req: TenantRequest, @Query('locale') localeQuery?: string) {
    return this.engagementsService.list(req.tenantId, parseLocale(localeQuery));
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
    return this.engagementsService.detail(req.tenantId, id, parseLocale(localeQuery));
  }
}
