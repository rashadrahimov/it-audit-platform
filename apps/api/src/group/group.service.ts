import { BadRequestException, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { resolveLocalized, type Locale } from '@it-audit/shared';
import { DbService } from '../db/db.service';
import { department, engagement, finding, membership, subsidiary } from '../db/schema';

interface Counts {
  engagementsByState: Record<string, number>;
  findingsByRating: Record<string, number>;
  findingsByStatus: Record<string, number>;
  openFindings: number;
}

const emptyCounts = (): Counts => ({
  engagementsByState: {},
  findingsByRating: {},
  findingsByStatus: {},
  openFindings: 0,
});

const bump = (rec: Record<string, number>, key: string): void => {
  rec[key] = (rec[key] ?? 0) + 1;
};

/**
 * Групповой уровень (T-012): агрегаты по всем дочкам тенанта с проверкой прав.
 * membership.subsidiary_scope (NULL = вся группа) режет видимость — member
 * с ограниченным скоупом не видит чужие дочки даже в агрегатах.
 */
@Injectable()
export class GroupService {
  constructor(private readonly dbService: DbService) {}

  async summary(tenantId: string, userId: string, locale: Locale) {
    const [me] = await this.dbService.db
      .select({ scope: membership.subsidiaryScope })
      .from(membership)
      .where(and(eq(membership.userId, userId), eq(membership.tenantId, tenantId)));
    if (!me) throw new BadRequestException('У юзера нет membership в тенанте');
    const scope = me.scope ?? null; // null = вся группа

    const data = await this.dbService.withTenant(tenantId, async (tx) => {
      const subsidiaries = await tx.select().from(subsidiary).where(isNull(subsidiary.deletedAt));
      const engagements = await tx
        .select({
          id: engagement.id,
          subsidiaryId: engagement.subsidiaryId,
          state: engagement.state,
        })
        .from(engagement)
        .where(isNull(engagement.deletedAt));
      const findings = await tx
        .select({
          engagementId: finding.engagementId,
          ownerMembershipId: finding.ownerMembershipId,
          riskRating: finding.riskRating,
          status: finding.status,
        })
        .from(finding)
        .where(isNull(finding.deletedAt));
      const departments = await tx.select().from(department);
      return { subsidiaries, engagements, findings, departments };
    });
    // membership над-тенантная — резолв департаментов владельцев вне RLS
    const memberships = await this.dbService.db
      .select({ id: membership.id, departmentId: membership.departmentId })
      .from(membership)
      .where(eq(membership.tenantId, tenantId));
    const departmentByMembership = new Map(memberships.map((m) => [m.id, m.departmentId]));

    const visible = data.subsidiaries.filter((s) => scope === null || scope.includes(s.id));
    const visibleIds = new Set(visible.map((s) => s.id));
    const subsidiaryByEngagement = new Map(data.engagements.map((e) => [e.id, e.subsidiaryId]));

    // департамент виден: группа-уровень (subsidiaryId NULL) — при полном скоупе; иначе — если его дочка в скоупе
    const visibleDepartments = data.departments.filter((d) =>
      d.subsidiaryId === null ? scope === null : visibleIds.has(d.subsidiaryId),
    );
    const byDepartment = new Map<string, Counts>(
      visibleDepartments.map((d) => [d.id, emptyCounts()]),
    );

    const bySubsidiary = new Map<string, Counts>(visible.map((s) => [s.id, emptyCounts()]));
    const group = emptyCounts();

    for (const e of data.engagements) {
      if (!visibleIds.has(e.subsidiaryId)) continue;
      bump(group.engagementsByState, e.state);
      bump(bySubsidiary.get(e.subsidiaryId)!.engagementsByState, e.state);
    }
    for (const f of data.findings) {
      const subsidiaryId = f.engagementId
        ? (subsidiaryByEngagement.get(f.engagementId) ?? null)
        : null;
      // привязанный к дочке finding виден при дочке в скоупе; standalone — только при полном скоупе
      if (subsidiaryId !== null && !visibleIds.has(subsidiaryId)) continue;
      if (subsidiaryId === null && scope !== null) continue;
      bump(group.findingsByRating, f.riskRating);
      bump(group.findingsByStatus, f.status);
      if (f.status !== 'closed') group.openFindings += 1;
      if (subsidiaryId !== null) {
        const counts = bySubsidiary.get(subsidiaryId)!;
        bump(counts.findingsByRating, f.riskRating);
        bump(counts.findingsByStatus, f.status);
        if (f.status !== 'closed') counts.openFindings += 1;
      }
      // третий уровень: департамент владельца finding'а
      const deptId = f.ownerMembershipId
        ? (departmentByMembership.get(f.ownerMembershipId) ?? null)
        : null;
      if (deptId !== null) {
        const counts = byDepartment.get(deptId);
        if (counts) {
          bump(counts.findingsByRating, f.riskRating);
          bump(counts.findingsByStatus, f.status);
          if (f.status !== 'closed') counts.openFindings += 1;
        }
      }
    }

    return {
      scope: scope === null ? 'group' : 'restricted',
      group,
      subsidiaries: visible.map((s) => ({
        id: s.id,
        name: resolveLocalized(s.nameI18n, locale),
        ...bySubsidiary.get(s.id)!,
      })),
      departments: visibleDepartments.map((d) => ({
        id: d.id,
        name: resolveLocalized(d.nameI18n, locale),
        subsidiaryId: d.subsidiaryId,
        ...byDepartment.get(d.id)!,
      })),
    };
  }
}
