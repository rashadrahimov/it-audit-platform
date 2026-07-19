import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOperation,
  ApiProduces,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { toDashboardPdf } from './dashboard-pdf';
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

// T-V15: правка — имя и/или полный набор виджетов
const updateSchema = z.object({
  name: z.string().min(1).optional(),
  widgets: z.array(widgetSchema).min(1).optional(),
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

  @Patch(':id')
  @RequirePermission('report', 'export', 'edit')
  @ApiOperation({ summary: 'Правка дашборда (T-V15): имя/виджеты' })
  update(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = updateSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    if (Object.keys(parsed.data).length === 0) {
      throw new BadRequestException('Нужно хотя бы одно поле');
    }
    return this.service.update(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data,
    );
  }

  @Delete(':id')
  @RequirePermission('report', 'export', 'edit')
  @ApiOperation({ summary: 'Удалить дашборд (T-V15): soft delete' })
  remove(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove({ tenantId: req.tenantId, userId: req.user.sub, ip: req.ip }, id);
  }

  @Get(':id/export')
  @RequirePermission('report', 'export', 'view')
  @ApiOperation({ summary: 'PDF-экспорт дашборда (T-V15): честный рендер chartType' })
  @ApiProduces('application/pdf')
  async exportPdf(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const data = await this.service.data(req.tenantId, id);
    const body = await toDashboardPdf(data);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(body.length));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(`dashboard-${data.name}.pdf`)}`,
    );
    res.end(body);
  }
}
