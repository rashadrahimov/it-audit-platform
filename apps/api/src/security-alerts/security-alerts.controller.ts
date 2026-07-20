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
import { ApiBearerAuth, ApiCreatedResponse, ApiHeader, ApiOperation } from '@nestjs/swagger';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { SecurityAlertsService } from './security-alerts.service';

/** T-V40: категории алертов. */
export const ALERT_CATEGORIES = [
  'malware',
  'phishing',
  'vulnerability',
  'misconfiguration',
  'unauthorized_access',
  'other',
] as const;

const createSchema = z.object({
  title: z.string().min(1),
  source: z.string().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  category: z.enum(ALERT_CATEGORIES).optional(),
  assetId: z.uuid().optional(),
  connectorId: z.uuid().optional(),
});

const transitionSchema = z.object({
  to: z.enum(['triaged', 'closed']),
  note: z.string().optional(),
});

@Controller('security-alerts')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class SecurityAlertsController {
  constructor(private readonly service: SecurityAlertsService) {}

  @Post()
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Создать security alert (T-064, B13)' })
  @ApiCreatedResponse({ description: 'Алерт в статусе new' })
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
  @ApiOperation({ summary: 'Triage (T-064): new→triaged→closed' })
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

  @Get()
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Security alerts тенанта (фильтры: status/severity/category/assetId)' })
  list(
    @Req() req: TenantRequest,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('category') category?: string,
    @Query('assetId') assetId?: string,
  ) {
    return this.service.list(req.tenantId, { status, severity, category, assetId });
  }
}
