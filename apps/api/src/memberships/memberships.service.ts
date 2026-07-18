import { Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { resolveLocalized, type Locale } from '@it-audit/shared';
import { DbService } from '../db/db.service';
import { membership, role, user } from '../db/schema';

/**
 * Список участников тенанта (T-A23, SCH-02). membership — control-plane таблица
 * без RLS, поэтому фильтруем по tenantId явно (как notifications/access-reviews).
 */
@Injectable()
export class MembershipsService {
  constructor(private readonly dbService: DbService) {}

  async list(tenantId: string, locale: Locale) {
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({
          id: membership.id,
          userId: membership.userId,
          fullName: user.fullName,
          email: user.email,
          category: membership.category,
          status: membership.status,
          roleName: role.nameI18n,
        })
        .from(membership)
        .innerJoin(user, eq(membership.userId, user.id))
        .innerJoin(role, eq(membership.roleId, role.id))
        .where(eq(membership.tenantId, tenantId))
        .orderBy(asc(user.fullName)),
    );
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      fullName: r.fullName,
      email: r.email,
      category: r.category,
      status: r.status,
      role: resolveLocalized(r.roleName, locale),
    }));
  }
}
