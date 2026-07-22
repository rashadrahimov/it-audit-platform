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
import JSZip from 'jszip';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import {
  REPORT_DELIVERABLES,
  REPORT_PACKAGE_FORMATS,
  ReportDataService,
  type ReportDeliverable,
} from './report-data.service';
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

function parseLocaleQuery(localeQuery?: string) {
  let locale = DEFAULT_LOCALE;
  if (localeQuery !== undefined) {
    const parsed = localeSchema.safeParse(localeQuery);
    if (!parsed.success) throw new BadRequestException('locale: ожидается en|az|ru');
    locale = parsed.data;
  }
  return locale;
}

@Controller('engagements/:id/report')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class ReportsController {
  constructor(private readonly reportDataService: ReportDataService) {}

  @Get('readiness')
  @RequirePermission('report', 'export', 'edit')
  @ApiOperation({ summary: 'T-H47: pre-flight готовность report package для engagement' })
  readiness(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('locale') localeQuery?: string,
  ) {
    const locale = parseLocaleQuery(localeQuery);
    return this.reportDataService.readiness(req.tenantId, id, locale);
  }

  @Get('package-manifest')
  @RequirePermission('report', 'export', 'edit')
  @ApiOperation({
    summary: 'T-H75: machine-checkable manifest for the standard audit report package',
  })
  @ApiQuery({ name: 'locale', required: false })
  packageManifest(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('locale') localeQuery?: string,
  ) {
    const locale = parseLocaleQuery(localeQuery);
    return this.reportDataService.packageManifest(req.tenantId, id, locale);
  }

  @Get('package')
  @RequirePermission('report', 'export', 'edit')
  @ApiOperation({
    summary: 'T-H78: ZIP-пакет стандартных deliverables — 5 документов × PDF/Word/Excel + manifest',
  })
  @ApiQuery({ name: 'locale', required: false })
  @ApiProduces('application/zip')
  async packageZip(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
    @Query('locale') localeQuery?: string,
  ): Promise<void> {
    const locale = parseLocaleQuery(localeQuery);
    const [manifest, ...reportData] = await Promise.all([
      this.reportDataService.packageManifest(req.tenantId, id, locale),
      ...REPORT_DELIVERABLES.map((deliverable) =>
        this.reportDataService.build(req.tenantId, id, locale, deliverable),
      ),
    ]);
    const zip = new JSZip();
    zip.file('package-manifest.json', JSON.stringify(manifest, null, 2));

    for (const data of reportData) {
      for (const format of REPORT_PACKAGE_FORMATS) {
        const body =
          format.key === 'pdf'
            ? await toPdf(data)
            : format.key === 'docx'
              ? await toDocx(data)
              : await toXlsx(data);
        zip.file(`${data.deliverable}/${data.deliverable}.${format.key}`, body);
      }
    }

    const body = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Length', String(body.length));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(`audit-package-${locale}.zip`)}`,
    );
    res.end(body);
  }

  @Get()
  @RequirePermission('report', 'export', 'edit')
  @ApiOperation({
    summary:
      'Экспорт deliverable engagement (T-045/T-H33): ?format=pdf|docx|xlsx|csv|xml&deliverable=...',
  })
  @ApiQuery({ name: 'format', enum: Object.keys(FORMATS) })
  @ApiQuery({ name: 'locale', required: false })
  @ApiQuery({ name: 'deliverable', required: false, enum: REPORT_DELIVERABLES })
  @ApiProduces(...Object.values(FORMATS).map((f) => f.mime))
  async export(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
    @Query('format') format?: string,
    @Query('locale') localeQuery?: string,
    @Query('deliverable') deliverableQuery?: string,
  ): Promise<void> {
    if (!format || !(format in FORMATS)) {
      throw new BadRequestException(`format: ожидается ${Object.keys(FORMATS).join('|')}`);
    }
    const locale = parseLocaleQuery(localeQuery);
    let deliverable: ReportDeliverable = 'audit_report';
    if (deliverableQuery !== undefined) {
      if (!REPORT_DELIVERABLES.includes(deliverableQuery as ReportDeliverable)) {
        throw new BadRequestException(`deliverable: ожидается ${REPORT_DELIVERABLES.join('|')}`);
      }
      deliverable = deliverableQuery as ReportDeliverable;
    }
    const data = await this.reportDataService.build(req.tenantId, id, locale, deliverable);
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
      `attachment; filename*=UTF-8''${encodeURIComponent(`${deliverable}.${spec.ext}`)}`,
    );
    res.end(body);
  }
}
