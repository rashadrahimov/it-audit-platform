import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiHeader, ApiOperation } from '@nestjs/swagger';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { DashboardsService } from './dashboards.service';
import { METRIC_NAMES } from './metrics.service';

const widgetSchema = z.object({
  metric: z.string().min(1),
  chartType: z.enum(['bar', 'pie', 'donut', 'number', 'line']),
  title: z.string().optional(),
});

const createSchema = z.object({
  name: z.string().min(1),
  widgets: z.array(widgetSchema).min(1),
});

@Controller('dashboards')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class DashboardsController {
  constructor(private readonly service: DashboardsService) {}

  @Post()
  @RequirePermission('report', 'export', 'edit')
  @ApiOperation({ summary: 'Создать чарт-дашборд (T-072, B9)' })
  @ApiCreatedResponse({ description: '{id, name}' })
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.create(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Get('metrics')
  @RequirePermission('report', 'export', 'view')
  @ApiOperation({ summary: 'Каталог доступных метрик (B9)' })
  metrics() {
    return { metrics: METRIC_NAMES };
  }

  @Get()
  @RequirePermission('report', 'export', 'view')
  @ApiOperation({ summary: 'Дашборды тенанта' })
  list(@Req() req: TenantRequest) {
    return this.service.list(req.tenantId);
  }

  @Get(':id/data')
  @RequirePermission('report', 'export', 'view')
  @ApiOperation({ summary: 'Дашборд с посчитанными данными виджетов' })
  data(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.data(req.tenantId, id);
  }
}
