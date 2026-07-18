import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { resolveLocalized, type Locale } from '@it-audit/shared';
import { DbService } from '../db/db.service';
import {
  auditType,
  checklistItem,
  engagement,
  finding,
  membership,
  response,
  subsidiary,
  user,
} from '../db/schema';

export interface ReportChecklistRow {
  ref: string;
  question: string;
  answer: string | null;
  compliance: string | null;
}

export interface ReportFindingRow {
  title: string;
  riskRating: string;
  status: string;
  owner: string | null;
  auditor: string | null;
  dueDate: string | null;
  recommendation: string | null;
}

export interface ReportData {
  title: string;
  subsidiary: string | null;
  auditType: string | null;
  mode: string;
  state: string;
  periodStart: string | null;
  periodEnd: string | null;
  checklist: ReportChecklistRow[];
  findings: ReportFindingRow[];
  generatedAt: string;
}

/** Сбор данных для отчёта engagement (T-045): шапка + чеклист-с-ответами + findings. */
@Injectable()
export class ReportDataService {
  constructor(private readonly dbService: DbService) {}

  async build(tenantId: string, engagementId: string, locale: Locale): Promise<ReportData> {
    return this.dbService.withTenant(tenantId, async (tx) => {
      const [eng] = await tx
        .select()
        .from(engagement)
        .where(and(eq(engagement.id, engagementId), isNull(engagement.deletedAt)));
      if (!eng) throw new NotFoundException(`Engagement ${engagementId} не найден`);
      const [sub] = await tx.select().from(subsidiary).where(eq(subsidiary.id, eng.subsidiaryId));
      const [type] = eng.auditTypeId
        ? await tx.select().from(auditType).where(eq(auditType.id, eng.auditTypeId))
        : [null];

      const items = await tx
        .select()
        .from(checklistItem)
        .where(eq(checklistItem.engagementId, engagementId))
        .orderBy(asc(checklistItem.order));
      const answers =
        items.length > 0
          ? await tx
              .select({
                checklistItemId: response.checklistItemId,
                text: response.text,
                compliance: response.complianceStatus,
              })
              .from(response)
          : [];
      const answerByItem = new Map(answers.map((a) => [a.checklistItemId, a]));

      const ownerMembership = alias(membership, 'owner_m');
      const ownerUser = alias(user, 'owner_u');
      const auditorMembership = alias(membership, 'auditor_m');
      const auditorUser = alias(user, 'auditor_u');
      const findings = await tx
        .select({
          titleI18n: finding.titleI18n,
          recommendationI18n: finding.recommendationI18n,
          riskRating: finding.riskRating,
          status: finding.status,
          dueDate: finding.dueDate,
          owner: ownerUser.fullName,
          auditor: auditorUser.fullName,
        })
        .from(finding)
        .leftJoin(ownerMembership, eq(finding.ownerMembershipId, ownerMembership.id))
        .leftJoin(ownerUser, eq(ownerMembership.userId, ownerUser.id))
        .leftJoin(auditorMembership, eq(finding.auditorMembershipId, auditorMembership.id))
        .leftJoin(auditorUser, eq(auditorMembership.userId, auditorUser.id))
        .where(and(eq(finding.engagementId, engagementId), isNull(finding.deletedAt)))
        .orderBy(asc(finding.createdAt));

      return {
        title: resolveLocalized(eng.titleI18n, locale),
        subsidiary: sub ? resolveLocalized(sub.nameI18n, locale) : null,
        auditType: type ? resolveLocalized(type.nameI18n, locale) : null,
        mode: eng.mode,
        state: eng.state,
        periodStart: eng.periodStart?.toISOString().slice(0, 10) ?? null,
        periodEnd: eng.periodEnd?.toISOString().slice(0, 10) ?? null,
        checklist: items.map((i) => {
          const a = answerByItem.get(i.id);
          return {
            ref: i.ref,
            question: resolveLocalized(i.questionI18n, locale),
            answer: a?.text ?? null,
            compliance: a?.compliance ?? null,
          };
        }),
        findings: findings.map((f) => ({
          title: resolveLocalized(f.titleI18n, locale),
          riskRating: f.riskRating,
          status: f.status,
          owner: f.owner,
          auditor: f.auditor,
          dueDate: f.dueDate?.toISOString().slice(0, 10) ?? null,
          recommendation: f.recommendationI18n
            ? resolveLocalized(f.recommendationI18n, locale)
            : null,
        })),
        generatedAt: new Date().toISOString(),
      };
    });
  }
}
