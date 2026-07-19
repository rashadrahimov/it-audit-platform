import { Injectable } from '@nestjs/common';
import { and, eq, isNull, ne, notInArray } from 'drizzle-orm';
import { resolveLocalized, type Locale } from '@it-audit/shared';
import { DbService } from '../db/db.service';
import {
  accessRequest,
  finding,
  membership,
  policy,
  policyAttestation,
  policyVersion,
  test,
} from '../db/schema';

/**
 * T-V18: агрегат «назначено мне» — персональный лендинг (аналог Vanta My work).
 * Всё режется по membership текущего юзера; RLS-контекст тенанта обязателен.
 */
@Injectable()
export class MyWorkService {
  constructor(private readonly dbService: DbService) {}

  async summary(userId: string, tenantId: string, locale: Locale) {
    const [me] = await this.dbService.db
      .select({ id: membership.id })
      .from(membership)
      .where(and(eq(membership.userId, userId), eq(membership.tenantId, tenantId)));
    if (!me) {
      return {
        findings: [],
        tests: [],
        policiesToApprove: [],
        attestationsPending: [],
        accessRequests: [],
      };
    }
    return this.dbService.withTenant(tenantId, async (tx) => {
      const findings = await tx
        .select({
          id: finding.id,
          titleI18n: finding.titleI18n,
          status: finding.status,
          slaStatus: finding.slaStatus,
          dueDate: finding.dueDate,
        })
        .from(finding)
        .where(
          and(
            isNull(finding.deletedAt),
            eq(finding.ownerMembershipId, me.id),
            notInArray(finding.status, ['closed']),
          ),
        );
      const tests = await tx
        .select({
          id: test.id,
          titleI18n: test.titleI18n,
          status: test.status,
          slaStatus: test.slaStatus,
        })
        .from(test)
        .where(
          and(
            isNull(test.deletedAt),
            eq(test.ownerMembershipId, me.id),
            ne(test.status, 'deactivated'),
          ),
        );
      const policiesToApprove = await tx
        .select({ id: policy.id, titleI18n: policy.titleI18n })
        .from(policy)
        .where(
          and(
            isNull(policy.deletedAt),
            eq(policy.approverMembershipId, me.id),
            eq(policy.status, 'in_review'),
          ),
        );
      const attestationsPending = await tx
        .select({ policyId: policy.id, titleI18n: policy.titleI18n })
        .from(policyAttestation)
        .innerJoin(policyVersion, eq(policyAttestation.policyVersionId, policyVersion.id))
        .innerJoin(policy, eq(policyVersion.policyId, policy.id))
        .where(
          and(eq(policyAttestation.membershipId, me.id), eq(policyAttestation.status, 'pending')),
        );
      const accessRequests = await tx
        .select({
          id: accessRequest.id,
          system: accessRequest.system,
          status: accessRequest.status,
        })
        .from(accessRequest)
        .where(eq(accessRequest.requesterMembershipId, me.id));
      return {
        findings: findings.map((f) => ({
          id: f.id,
          title: resolveLocalized(f.titleI18n, locale),
          status: f.status,
          slaStatus: f.slaStatus,
          dueDate: f.dueDate?.toISOString() ?? null,
        })),
        tests: tests.map((t) => ({
          id: t.id,
          title: resolveLocalized(t.titleI18n, locale),
          status: t.status,
          slaStatus: t.slaStatus,
        })),
        policiesToApprove: policiesToApprove.map((p) => ({
          id: p.id,
          title: resolveLocalized(p.titleI18n, locale),
        })),
        attestationsPending: attestationsPending.map((p) => ({
          policyId: p.policyId,
          title: resolveLocalized(p.titleI18n, locale),
        })),
        accessRequests,
      };
    });
  }
}
