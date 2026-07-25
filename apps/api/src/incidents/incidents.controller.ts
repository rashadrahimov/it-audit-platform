import {
  BadRequestException,
  Body,
  Controller,
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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import {
  INCIDENT_CATEGORIES,
  INCIDENT_SEVERITIES,
  INCIDENT_SOURCES,
  INCIDENT_STATUSES,
} from './incident-flow';
import { IncidentsService } from './incidents.service';

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

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  severity: z.enum(INCIDENT_SEVERITIES).optional(),
  category: z.enum(INCIDENT_CATEGORIES).nullable().optional(),
  commanderMembershipId: z.uuid().nullable().optional(),
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
  @ApiOperation({ summary: 'Инциденты тенанта (фильтры: status/severity/category/commander)' })
  list(
    @Req() req: TenantRequest,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('category') category?: string,
    @Query('commanderMembershipId') commanderMembershipId?: string,
  ) {
    return this.service.list(req.tenantId, { status, severity, category, commanderMembershipId });
  }

  @Get(':id')
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Карточка инцидента: фазы, таймлайн, доступные переходы' })
  detail(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(req.tenantId, id);
  }
}
