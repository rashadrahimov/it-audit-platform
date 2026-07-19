import { BadRequestException, Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiQuery } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { ReportsExportService } from './reports-export.service';

@Controller('reports')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class ReportsExportController {
  constructor(private readonly service: ReportsExportService) {}

  @Get('export')
  @RequirePermission('report', 'export', 'edit')
  @ApiOperation({
    summary: 'Tenant-wide выгрузка findings/risks/controls в CSV/XML (T-098, REP-05)',
  })
  @ApiQuery({ name: 'entity', required: true, description: 'findings|risks|controls' })
  @ApiQuery({ name: 'format', required: true, description: 'csv|xml' })
  async export(
    @Req() req: TenantRequest,
    @Res() res: Response,
    @Query('entity') entity?: string,
    @Query('format') format?: string,
  ) {
    if (!entity || !format) throw new BadRequestException('Нужны entity и format');
    const out = await this.service.export(req.tenantId, entity, format);
    res.setHeader('Content-Type', out.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
    res.send(out.body);
  }

  @Get('compare')
  @RequirePermission('report', 'export', 'view')
  @ApiOperation({ summary: 'Сравнение двух снапшотов по периодам (T-099, REP-03)' })
  @ApiQuery({ name: 'a', required: true })
  @ApiQuery({ name: 'b', required: true })
  compare(@Req() req: TenantRequest, @Query('a') a?: string, @Query('b') b?: string) {
    if (!a || !b) throw new BadRequestException('Нужны параметры a и b (id снапшотов)');
    return this.service.compare(req.tenantId, a, b);
  }

  @Get('trend')
  @RequirePermission('report', 'export', 'view')
  @ApiOperation({ summary: 'Тренд метрики по всем снапшотам (T-H13, RSK-08)' })
  @ApiQuery({ name: 'group', required: false, description: 'по умолчанию risks_by_class' })
  trend(@Req() req: TenantRequest, @Query('group') group?: string) {
    return this.service.metricTrend(req.tenantId, group || 'risks_by_class');
  }
}
