import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiProduces, ApiQuery } from '@nestjs/swagger';
import type { Response } from 'express';
import { DEFAULT_LOCALE, localeSchema } from '@it-audit/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { ReportDataService } from './report-data.service';
import { toCsv, toDocx, toPdf, toXlsx, toXml } from './report-renderers';

const FORMATS = {
  pdf: { mime: 'application/pdf', ext: 'pdf' },
  docx: {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ext: 'docx',
  },
  xlsx: {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ext: 'xlsx',
  },
  csv: { mime: 'text/csv', ext: 'csv' },
  xml: { mime: 'application/xml', ext: 'xml' },
} as const;

type Format = keyof typeof FORMATS;

@Controller('engagements/:id/report')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class ReportsController {
  constructor(private readonly reportDataService: ReportDataService) {}

  @Get()
  @RequirePermission('report', 'export', 'edit')
  @ApiOperation({ summary: 'Экспорт отчёта engagement (T-045): ?format=pdf|docx|xlsx|csv|xml' })
  @ApiQuery({ name: 'format', enum: Object.keys(FORMATS) })
  @ApiQuery({ name: 'locale', required: false })
  @ApiProduces(...Object.values(FORMATS).map((f) => f.mime))
  async export(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
    @Query('format') format?: string,
    @Query('locale') localeQuery?: string,
  ): Promise<void> {
    if (!format || !(format in FORMATS)) {
      throw new BadRequestException(`format: ожидается ${Object.keys(FORMATS).join('|')}`);
    }
    let locale = DEFAULT_LOCALE;
    if (localeQuery !== undefined) {
      const parsed = localeSchema.safeParse(localeQuery);
      if (!parsed.success) throw new BadRequestException('locale: ожидается en|az|ru');
      locale = parsed.data;
    }
    const data = await this.reportDataService.build(req.tenantId, id, locale);
    const spec = FORMATS[format as Format];
    const body =
      format === 'pdf'
        ? await toPdf(data)
        : format === 'docx'
          ? await toDocx(data)
          : format === 'xlsx'
            ? await toXlsx(data)
            : format === 'csv'
              ? toCsv(data)
              : toXml(data);

    res.setHeader('Content-Type', spec.mime);
    res.setHeader('Content-Length', String(body.length));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(`engagement-report.${spec.ext}`)}`,
    );
    res.end(body);
  }
}
