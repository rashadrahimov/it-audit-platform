import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { engagement, membership, signOff, workingPaper } from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

/** WP workflow (WP-02): draft→prepared→in_review→reviewed→signed_off. */
const FLOW: Record<string, string[]> = {
  draft: ['prepared'],
  prepared: ['in_review'],
  in_review: ['reviewed', 'prepared'],
  reviewed: ['signed_off'],
};

@Injectable()
export class WorkingPapersService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private async myMembership(
    tx: Parameters<Parameters<DbService['withTenant']>[1]>[0],
    actor: Actor,
  ) {
    const [me] = await tx
      .select({ id: membership.id })
      .from(membership)
      .where(and(eq(membership.userId, actor.userId), eq(membership.tenantId, actor.tenantId)));
    return me?.id ?? null;
  }

  async create(actor: Actor, input: { engagementId: string; title: string; content?: unknown }) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [eng] = await tx
        .select({ id: engagement.id })
        .from(engagement)
        .where(and(eq(engagement.id, input.engagementId), isNull(engagement.deletedAt)));
      if (!eng) throw new BadRequestException(`Engagement ${input.engagementId} не найден`);
      const meId = await this.myMembership(tx, actor);
      const [row] = await tx
        .insert(workingPaper)
        .values({
          engagementId: input.engagementId,
          title: input.title,
          content: input.content ?? {},
          preparerMembershipId: meId,
        })
        .returning();
      if (!row) throw new Error('WP не создался');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'working_paper.created',
      entityType: 'working_paper',
      entityId: created.id,
      after: { title: created.title },
    });
    return { id: created.id, status: created.status };
  }

  /** Правка content: после reviewed/signed_off → edited_since_review=true (WP-08). */
  async editContent(actor: Actor, id: string, content: unknown) {
    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [wp] = await tx
        .select()
        .from(workingPaper)
        .where(and(eq(workingPaper.id, id), isNull(workingPaper.deletedAt)));
      if (!wp) throw new NotFoundException(`WP ${id} не найден`);
      const afterReview = wp.status === 'reviewed' || wp.status === 'signed_off';
      await tx
        .update(workingPaper)
        .set({
          content: content as object,
          editedSinceReview: afterReview ? true : wp.editedSinceReview,
        })
        .where(eq(workingPaper.id, id));
      return { editedSinceReview: afterReview || wp.editedSinceReview };
    });
    return { id, editedSinceReview: result.editedSinceReview };
  }

  async transition(actor: Actor, id: string, to: string) {
    const result = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [wp] = await tx
        .select()
        .from(workingPaper)
        .where(and(eq(workingPaper.id, id), isNull(workingPaper.deletedAt)));
      if (!wp) throw new NotFoundException(`WP ${id} не найден`);
      if (!FLOW[wp.status]?.includes(to)) {
        throw new BadRequestException(`Переход ${wp.status} → ${to} недопустим`);
      }
      const meId = await this.myMembership(tx, actor);
      // reviewed — подписывает reviewer, который ≠ preparer (WP-07)
      if (to === 'reviewed') {
        if (meId && wp.preparerMembershipId && meId === wp.preparerMembershipId) {
          throw new ForbiddenException('Reviewer не может совпадать с preparer (WP-07)');
        }
        await tx
          .update(workingPaper)
          .set({ status: to, reviewerMembershipId: meId, editedSinceReview: false })
          .where(eq(workingPaper.id, id));
        await tx
          .insert(signOff)
          .values({ workingPaperId: id, membershipId: meId!, role: 'reviewer' });
      } else {
        await tx.update(workingPaper).set({ status: to }).where(eq(workingPaper.id, id));
        if (to === 'prepared' && meId) {
          await tx
            .insert(signOff)
            .values({ workingPaperId: id, membershipId: meId, role: 'preparer' });
        }
      }
      return { before: wp.status, after: to };
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'working_paper.status_changed',
      entityType: 'working_paper',
      entityId: id,
      before: { status: result.before },
      after: { status: result.after },
    });
    return result;
  }

  async list(tenantId: string, engagementId: string) {
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({
          id: workingPaper.id,
          title: workingPaper.title,
          status: workingPaper.status,
          editedSinceReview: workingPaper.editedSinceReview,
        })
        .from(workingPaper)
        .where(and(eq(workingPaper.engagementId, engagementId), isNull(workingPaper.deletedAt)))
        .orderBy(desc(workingPaper.createdAt)),
    );
    return rows;
  }

  async get(tenantId: string, id: string) {
    return this.dbService.withTenant(tenantId, async (tx) => {
      const [wp] = await tx
        .select()
        .from(workingPaper)
        .where(and(eq(workingPaper.id, id), isNull(workingPaper.deletedAt)));
      if (!wp) throw new NotFoundException(`WP ${id} не найден`);
      const signs = await tx
        .select({
          role: signOff.role,
          membershipId: signOff.membershipId,
          signedAt: signOff.signedAt,
        })
        .from(signOff)
        .where(eq(signOff.workingPaperId, id));
      return {
        id: wp.id,
        title: wp.title,
        content: wp.content,
        status: wp.status,
        preparerMembershipId: wp.preparerMembershipId,
        reviewerMembershipId: wp.reviewerMembershipId,
        editedSinceReview: wp.editedSinceReview,
        signOffs: signs,
      };
    });
  }
}
