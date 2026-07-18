import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { localeSchema } from '@it-audit/shared';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { EmailService } from '../email/email.service';
import { membership, policy, policyAttestation, policyVersion, user } from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

/**
 * Attestation политик (T-053, B4): кампания рассылки approved-версии членам,
 * подтверждение ознакомления, трекинг подтверждённых/нет.
 */
@Injectable()
export class AttestationsService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
    private readonly emailService: EmailService,
  ) {}

  /** Кампания: создать attestation-записи для набора членов на последнюю approved-версию + письма. */
  async campaign(actor: Actor, policyId: string, membershipIds: string[]) {
    const { versionId, title, recipients } = await this.dbService.withTenant(
      actor.tenantId,
      async (tx) => {
        const [pol] = await tx
          .select()
          .from(policy)
          .where(and(eq(policy.id, policyId), isNull(policy.deletedAt)));
        if (!pol) throw new NotFoundException(`Политика ${policyId} не найдена`);
        if (pol.status !== 'approved') {
          throw new BadRequestException('Attestation доступна только для approved-политики');
        }
        const [version] = await tx
          .select()
          .from(policyVersion)
          .where(eq(policyVersion.policyId, policyId))
          .orderBy(desc(policyVersion.version))
          .limit(1);
        if (!version) throw new BadRequestException('У политики нет версий');

        const members = await tx
          .select({ id: membership.id, email: user.email, locale: user.locale })
          .from(membership)
          .innerJoin(user, eq(membership.userId, user.id))
          .where(eq(membership.tenantId, actor.tenantId));
        const memberById = new Map(members.map((m) => [m.id, m]));
        const chosen = membershipIds.filter((id) => memberById.has(id));
        if (chosen.length === 0) throw new BadRequestException('Нет валидных получателей');

        for (const membershipId of chosen) {
          await tx
            .insert(policyAttestation)
            .values({ policyVersionId: version.id, membershipId })
            .onConflictDoNothing();
        }
        return {
          versionId: version.id,
          title: pol.titleI18n,
          recipients: chosen.map((id) => memberById.get(id)!),
        };
      },
    );

    for (const r of recipients) {
      const parsed = localeSchema.safeParse(r.locale);
      await this.emailService.sendTemplate(
        'policy-attestation',
        parsed.success ? parsed.data : 'en',
        r.email,
        { policyTitle: title.en },
      );
    }
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'policy.attestation_campaign',
      entityType: 'policy',
      entityId: policyId,
      after: { versionId, recipients: recipients.length },
    });
    return { versionId, sent: recipients.length };
  }

  /** Текущий юзер подтверждает ознакомление (только адресованную ему запись). */
  async attest(actor: Actor, policyId: string) {
    const attested = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [me] = await tx
        .select({ id: membership.id })
        .from(membership)
        .where(and(eq(membership.userId, actor.userId), eq(membership.tenantId, actor.tenantId)));
      if (!me) throw new BadRequestException('У юзера нет membership в тенанте');
      const [version] = await tx
        .select({ id: policyVersion.id })
        .from(policyVersion)
        .where(eq(policyVersion.policyId, policyId))
        .orderBy(desc(policyVersion.version))
        .limit(1);
      if (!version) throw new NotFoundException('У политики нет версий');
      const [row] = await tx
        .update(policyAttestation)
        .set({ status: 'attested', attestedAt: new Date() })
        .where(
          and(
            eq(policyAttestation.policyVersionId, version.id),
            eq(policyAttestation.membershipId, me.id),
          ),
        )
        .returning();
      if (!row) throw new NotFoundException('Вам не назначена attestation этой политики');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'policy.attested',
      entityType: 'policy',
      entityId: policyId,
    });
    return { status: attested.status, attestedAt: attested.attestedAt?.toISOString() ?? null };
  }

  /** Трекинг: кто подтвердил, кто нет (последняя версия). */
  async status(tenantId: string, policyId: string, locale: 'en' | 'az' | 'ru') {
    return this.dbService.withTenant(tenantId, async (tx) => {
      const [version] = await tx
        .select({ id: policyVersion.id, version: policyVersion.version })
        .from(policyVersion)
        .where(eq(policyVersion.policyId, policyId))
        .orderBy(desc(policyVersion.version))
        .limit(1);
      if (!version) return { version: null, total: 0, attested: 0, rows: [] };
      const rows = await tx
        .select({
          fullName: user.fullName,
          status: policyAttestation.status,
          attestedAt: policyAttestation.attestedAt,
        })
        .from(policyAttestation)
        .innerJoin(membership, eq(policyAttestation.membershipId, membership.id))
        .innerJoin(user, eq(membership.userId, user.id))
        .where(eq(policyAttestation.policyVersionId, version.id));
      void locale;
      return {
        version: version.version,
        total: rows.length,
        attested: rows.filter((r) => r.status === 'attested').length,
        rows: rows.map((r) => ({
          member: r.fullName,
          status: r.status,
          attestedAt: r.attestedAt?.toISOString() ?? null,
        })),
      };
    });
  }
}
