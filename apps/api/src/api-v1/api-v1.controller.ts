import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiSecurity } from '@nestjs/swagger';
import { and, desc, isNull } from 'drizzle-orm';
import { resolveLocalized } from '@it-audit/shared';
import { ApiKeyGuard, type ApiKeyRequest } from '../api-keys/api-key.guard';
import {
  asset,
  control,
  document,
  engagement,
  finding,
  policy,
  risk,
  securityAlert,
  test,
  vendor,
  vulnerability,
} from '../db/schema';
import { DbService } from '../db/db.service';
import { buildReportPackageManifest, ReportDataService } from '../reports/report-data.service';

/**
 * Публичный версионированный REST API (T-091/T-V37, EP-API, INT-01): read-only
 * программный доступ ко ВСЕМ основным ресурсам, аутентификация API-ключом (X-Api-Key),
 * tenant-скоуп через withTenant. Отдаёт стабильные публичные формы (не внутренние DTO);
 * i18n-поля резолвятся в en. Мутации — через доменные API под JWT (публичный API только чтение).
 */
@Controller('api/v1')
@UseGuards(ApiKeyGuard)
@ApiSecurity('api-key')
export class ApiV1Controller {
  constructor(
    private readonly dbService: DbService,
    private readonly reportDataService: ReportDataService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Индекс публичного API — список доступных ресурсов' })
  index() {
    return {
      version: 'v1',
      resources: [
        'controls',
        'findings',
        'risks',
        'vendors',
        'policies',
        'engagements',
        'assets',
        'tests',
        'vulnerabilities',
        'security-alerts',
        'documents',
        'report-packages',
      ].map((r) => `/api/v1/${r}`),
    };
  }

  @Get('controls')
  @ApiOperation({ summary: 'Контроли тенанта' })
  @ApiOkResponse({ description: '[{id, ref, objective}]' })
  async controls(@Req() req: ApiKeyRequest) {
    const rows = await this.dbService.withTenant(req.tenantId, (tx) =>
      tx
        .select({ id: control.id, ref: control.ref, objectiveI18n: control.objectiveI18n })
        .from(control)
        .where(isNull(control.deletedAt)),
    );
    return rows.map((c) => ({
      id: c.id,
      ref: c.ref,
      objective: resolveLocalized(c.objectiveI18n, 'en'),
    }));
  }

  @Get('findings')
  @ApiOperation({ summary: 'Findings тенанта' })
  async findings(@Req() req: ApiKeyRequest) {
    const rows = await this.dbService.withTenant(req.tenantId, (tx) =>
      tx
        .select({
          id: finding.id,
          titleI18n: finding.titleI18n,
          riskRating: finding.riskRating,
          status: finding.status,
          slaStatus: finding.slaStatus,
          dueDate: finding.dueDate,
        })
        .from(finding)
        .where(isNull(finding.deletedAt))
        .orderBy(desc(finding.createdAt)),
    );
    return rows.map((f) => ({
      id: f.id,
      title: resolveLocalized(f.titleI18n, 'en'),
      riskRating: f.riskRating,
      status: f.status,
      slaStatus: f.slaStatus,
      dueDate: f.dueDate ? f.dueDate.toISOString() : null,
    }));
  }

  @Get('risks')
  @ApiOperation({ summary: 'Риски тенанта' })
  async risks(@Req() req: ApiKeyRequest) {
    const rows = await this.dbService.withTenant(req.tenantId, (tx) =>
      tx
        .select({
          id: risk.id,
          titleI18n: risk.titleI18n,
          category: risk.category,
          riskClass: risk.riskClass,
          residualClass: risk.residualClass,
          treatment: risk.treatment,
          status: risk.status,
        })
        .from(risk)
        .where(isNull(risk.deletedAt))
        .orderBy(desc(risk.createdAt)),
    );
    return rows.map((r) => ({
      id: r.id,
      title: resolveLocalized(r.titleI18n, 'en'),
      category: r.category,
      inherentClass: r.riskClass,
      residualClass: r.residualClass,
      treatment: r.treatment,
      status: r.status,
    }));
  }

  @Get('vendors')
  @ApiOperation({ summary: 'Вендоры тенанта' })
  async vendors(@Req() req: ApiKeyRequest) {
    const rows = await this.dbService.withTenant(req.tenantId, (tx) =>
      tx
        .select({
          id: vendor.id,
          name: vendor.name,
          category: vendor.category,
          inherentRisk: vendor.inherentRisk,
          residualRisk: vendor.residualRisk,
          status: vendor.status,
        })
        .from(vendor)
        .where(isNull(vendor.deletedAt))
        .orderBy(desc(vendor.createdAt)),
    );
    return rows;
  }

  @Get('policies')
  @ApiOperation({ summary: 'Политики тенанта' })
  async policies(@Req() req: ApiKeyRequest) {
    const rows = await this.dbService.withTenant(req.tenantId, (tx) =>
      tx
        .select({
          id: policy.id,
          titleI18n: policy.titleI18n,
          status: policy.status,
          renewBy: policy.renewBy,
        })
        .from(policy)
        .where(isNull(policy.deletedAt))
        .orderBy(desc(policy.createdAt)),
    );
    return rows.map((p) => ({
      id: p.id,
      title: resolveLocalized(p.titleI18n, 'en'),
      status: p.status,
      renewBy: p.renewBy ? p.renewBy.toISOString() : null,
    }));
  }

  @Get('engagements')
  @ApiOperation({ summary: 'Аудиты тенанта' })
  async engagements(@Req() req: ApiKeyRequest) {
    const rows = await this.dbService.withTenant(req.tenantId, (tx) =>
      tx
        .select({
          id: engagement.id,
          titleI18n: engagement.titleI18n,
          state: engagement.state,
          mode: engagement.mode,
          periodStart: engagement.periodStart,
          periodEnd: engagement.periodEnd,
        })
        .from(engagement)
        .where(and(isNull(engagement.deletedAt), isNull(engagement.archivedAt)))
        .orderBy(desc(engagement.createdAt)),
    );
    return rows.map((e) => ({
      id: e.id,
      title: resolveLocalized(e.titleI18n, 'en'),
      state: e.state,
      mode: e.mode,
      periodStart: e.periodStart,
      periodEnd: e.periodEnd,
    }));
  }

  @Get('report-packages')
  @ApiOperation({
    summary: 'Метаданные стандартных audit deliverables: readiness + manifest для автоматизаций',
  })
  async reportPackages(@Req() req: ApiKeyRequest) {
    const rows = await this.dbService.withTenant(req.tenantId, (tx) =>
      tx
        .select({
          id: engagement.id,
          titleI18n: engagement.titleI18n,
          state: engagement.state,
          mode: engagement.mode,
          periodStart: engagement.periodStart,
          periodEnd: engagement.periodEnd,
        })
        .from(engagement)
        .where(and(isNull(engagement.deletedAt), isNull(engagement.archivedAt)))
        .orderBy(desc(engagement.createdAt)),
    );
    return Promise.all(
      rows.map(async (row) => {
        const readiness = await this.reportDataService.readiness(req.tenantId, row.id, 'en');
        const manifest = buildReportPackageManifest(row.id, 'en', readiness);
        return {
          engagementId: row.id,
          title: resolveLocalized(row.titleI18n, 'en'),
          state: row.state,
          mode: row.mode,
          periodStart: row.periodStart ? row.periodStart.toISOString() : null,
          periodEnd: row.periodEnd ? row.periodEnd.toISOString() : null,
          readiness: {
            score: readiness.score,
            ready: readiness.ready,
            checklistTotal: readiness.checklistTotal,
            answered: readiness.answered,
            findings: readiness.findings,
            risks: readiness.risks,
            evidenceLinks: readiness.evidenceLinks,
            checks: readiness.checks,
          },
          package: {
            totalFiles: manifest.totalFiles,
            supportedLocales: manifest.supportedLocales,
            formats: manifest.formats,
            deliverables: manifest.deliverables.map((deliverable) => ({
              key: deliverable.key,
              title: deliverable.title,
              formats: deliverable.formats.map((format) => format.key),
            })),
            dataSources: manifest.dataSources,
            evidenceGrounded: manifest.evidenceGrounded,
            humanReviewRequired: manifest.humanReviewRequired,
          },
        };
      }),
    );
  }

  @Get('assets')
  @ApiOperation({ summary: 'Активы тенанта' })
  async assets(@Req() req: ApiKeyRequest) {
    const rows = await this.dbService.withTenant(req.tenantId, (tx) =>
      tx
        .select({ id: asset.id, name: asset.name, type: asset.type, externalId: asset.externalId })
        .from(asset)
        .where(isNull(asset.deletedAt))
        .orderBy(desc(asset.createdAt)),
    );
    return rows;
  }

  @Get('tests')
  @ApiOperation({ summary: 'Тесты контролей тенанта' })
  async tests(@Req() req: ApiKeyRequest) {
    const rows = await this.dbService.withTenant(req.tenantId, (tx) =>
      tx
        .select({
          id: test.id,
          titleI18n: test.titleI18n,
          kind: test.kind,
          category: test.category,
          status: test.status,
          slaStatus: test.slaStatus,
        })
        .from(test)
        .where(isNull(test.deletedAt))
        .orderBy(desc(test.createdAt)),
    );
    return rows.map((tt) => ({
      id: tt.id,
      title: resolveLocalized(tt.titleI18n, 'en'),
      kind: tt.kind,
      category: tt.category,
      status: tt.status,
      slaStatus: tt.slaStatus,
    }));
  }

  @Get('vulnerabilities')
  @ApiOperation({ summary: 'Уязвимости тенанта' })
  async vulnerabilities(@Req() req: ApiKeyRequest) {
    const rows = await this.dbService.withTenant(req.tenantId, (tx) =>
      tx
        .select({
          id: vulnerability.id,
          cve: vulnerability.cve,
          title: vulnerability.title,
          severity: vulnerability.severity,
          status: vulnerability.status,
          slaStatus: vulnerability.slaStatus,
          dueDate: vulnerability.dueDate,
        })
        .from(vulnerability)
        .where(isNull(vulnerability.deletedAt))
        .orderBy(desc(vulnerability.createdAt)),
    );
    return rows.map((v) => ({
      id: v.id,
      cve: v.cve,
      title: v.title,
      severity: v.severity,
      status: v.status,
      slaStatus: v.slaStatus,
      dueDate: v.dueDate ? v.dueDate.toISOString() : null,
    }));
  }

  @Get('security-alerts')
  @ApiOperation({ summary: 'Security alerts тенанта' })
  async securityAlerts(@Req() req: ApiKeyRequest) {
    const rows = await this.dbService.withTenant(req.tenantId, (tx) =>
      tx
        .select({
          id: securityAlert.id,
          title: securityAlert.title,
          severity: securityAlert.severity,
          category: securityAlert.category,
          status: securityAlert.status,
          slaStatus: securityAlert.slaStatus,
        })
        .from(securityAlert)
        .where(isNull(securityAlert.deletedAt))
        .orderBy(desc(securityAlert.createdAt)),
    );
    return rows;
  }

  @Get('documents')
  @ApiOperation({ summary: 'Документы тенанта' })
  async documents(@Req() req: ApiKeyRequest) {
    const rows = await this.dbService.withTenant(req.tenantId, (tx) =>
      tx
        .select({
          id: document.id,
          filename: document.filename,
          version: document.version,
          status: document.status,
          category: document.category,
        })
        .from(document)
        .where(isNull(document.deletedAt))
        .orderBy(desc(document.createdAt)),
    );
    return rows;
  }
}
