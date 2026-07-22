import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { and, asc, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { auditLog, authEvent, user } from '../db/schema';
import { toSyslogLines } from './syslog';

/** Каноничная строка записи для hash-chain (T-104, LOG-01). Порядок полей фиксирован. */
function canonical(row: {
  tenantId: string | null;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  at: string;
}): string {
  return JSON.stringify([
    row.tenantId,
    row.actorUserId,
    row.action,
    row.entityType,
    row.entityId,
    row.before ?? null,
    row.after ?? null,
    row.at,
  ]);
}
const chainHash = (prevHash: string | null, content: string): string =>
  createHash('sha256')
    .update((prevHash ?? '') + content)
    .digest('hex');

export interface AuditRecord {
  tenantId?: string | null;
  actorUserId?: string | null;
  actorIp?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

export interface AuthEventRecord {
  userId?: string | null;
  event: 'login' | 'logout' | 'failed' | 'locked' | 'concurrent_session' | 'magic_link_requested';
  ip?: string | null;
  userAgent?: string | null;
}

export interface RecentAuditEvent {
  id: string;
  at: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  actorIp: string | null;
  hasBefore: boolean;
  hasAfter: boolean;
  prevHashPresent: boolean;
  hashPresent: boolean;
}

/**
 * Журналы (T-021). Запись не должна ронять бизнес-операцию — ошибки глотаются
 * с логом в stderr; hash-chain добавится в EP-HARDEN.
 */
@Injectable()
export class AuditLogService {
  constructor(private readonly dbService: DbService) {}

  async record(entry: AuditRecord): Promise<void> {
    const tenantId = entry.tenantId ?? null;
    try {
      await this.dbService.db.transaction(async (tx) => {
        // контекст тенанта: RLS audit_log_read пускает читать прошлые звенья ЭТОГО тенанта
        if (tenantId) {
          await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
        }
        // сериализуем аппенд в цепочку тенанта (LOG-01): один за раз
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext(${'audit_chain_' + (tenantId ?? 'system')}))`,
        );
        let prevHash: string | null = null;
        // системные события (tenant NULL) RLS не даёт читать app-роли → без цепочки
        if (tenantId) {
          const [last] = await tx
            .select({ hash: auditLog.hash })
            .from(auditLog)
            .where(and(eq(auditLog.tenantId, tenantId), isNotNull(auditLog.hash)))
            .orderBy(desc(auditLog.id))
            .limit(1);
          prevHash = last?.hash ?? null;
        }
        const at = new Date();
        const payload = {
          tenantId,
          actorUserId: entry.actorUserId ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          before: entry.before ?? null,
          after: entry.after ?? null,
          at: at.toISOString(),
        };
        // цепочку строим только для тенантных событий
        const hash = tenantId ? chainHash(prevHash, canonical(payload)) : null;
        await tx.insert(auditLog).values({
          ...payload,
          actorIp: entry.actorIp ?? null,
          at,
          prevHash,
          hash,
        });
      });
    } catch (error) {
      console.error('audit_log не записался:', error instanceof Error ? error.message : error);
    }
  }

  /**
   * Проверка целостности hash-chain тенанта (T-104, LOG-01): пересчёт хэшей + линковки.
   * Под RLS-контекстом тенанта (withTenant); легаси-строки (hash NULL) игнорируются.
   */
  async verifyChain(tenantId: string): Promise<{
    valid: boolean;
    checked: number;
    brokenAt?: string;
    reason?: string;
  }> {
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx.select().from(auditLog).where(isNotNull(auditLog.hash)).orderBy(asc(auditLog.id)),
    );
    let prevHash: string | null = null;
    for (const r of rows) {
      if ((r.prevHash ?? null) !== prevHash) {
        return { valid: false, checked: rows.length, brokenAt: r.id, reason: 'chain-link' };
      }
      const expected = chainHash(
        prevHash,
        canonical({
          tenantId: r.tenantId,
          actorUserId: r.actorUserId,
          action: r.action,
          entityType: r.entityType,
          entityId: r.entityId,
          before: r.before,
          after: r.after,
          at: r.at.toISOString(),
        }),
      );
      if (r.hash !== expected) {
        return { valid: false, checked: rows.length, brokenAt: r.id, reason: 'content-hash' };
      }
      prevHash = r.hash;
    }
    return { valid: true, checked: rows.length };
  }

  /**
   * Экспорт последних security-событий тенанта в RFC 5424 syslog (LOG-06, T-H09).
   * Форвардинг в внешний syslog-приёмник и retention — инфра [!]; здесь строки.
   */
  async syslogExport(tenantId: string, limit = 200): Promise<string> {
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({
          action: auditLog.action,
          at: auditLog.at,
          tenantId: auditLog.tenantId,
          actorUserId: auditLog.actorUserId,
          actorIp: auditLog.actorIp,
          entityType: auditLog.entityType,
          entityId: auditLog.entityId,
        })
        .from(auditLog)
        .where(eq(auditLog.tenantId, tenantId))
        .orderBy(desc(auditLog.at))
        .limit(Math.min(Math.max(limit, 1), 1000)),
    );
    return toSyslogLines(rows);
  }

  /**
   * Последние события аудит-журнала для UI traceability (SEC-лог без payload-секретов).
   * before/after намеренно не отдаём наружу: в diff могут попадать чувствительные поля.
   */
  async recent(tenantId: string, limit = 50): Promise<RecentAuditEvent[]> {
    const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 200);
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({
          id: auditLog.id,
          at: auditLog.at,
          action: auditLog.action,
          actorUserId: auditLog.actorUserId,
          actorName: user.fullName,
          actorEmail: user.email,
          actorIp: auditLog.actorIp,
          entityType: auditLog.entityType,
          entityId: auditLog.entityId,
          hasBefore: sql<boolean>`${auditLog.before} is not null`,
          hasAfter: sql<boolean>`${auditLog.after} is not null`,
          prevHashPresent: sql<boolean>`${auditLog.prevHash} is not null`,
          hashPresent: sql<boolean>`${auditLog.hash} is not null`,
        })
        .from(auditLog)
        .leftJoin(user, eq(auditLog.actorUserId, user.id))
        .where(eq(auditLog.tenantId, tenantId))
        .orderBy(desc(auditLog.at))
        .limit(safeLimit),
    );
    return rows.map((r) => ({
      ...r,
      at: r.at.toISOString(),
      hasBefore: Boolean(r.hasBefore),
      hasAfter: Boolean(r.hasAfter),
      prevHashPresent: Boolean(r.prevHashPresent),
      hashPresent: Boolean(r.hashPresent),
    }));
  }

  async recordAuthEvent(entry: AuthEventRecord): Promise<void> {
    try {
      await this.dbService.db.insert(authEvent).values({
        userId: entry.userId ?? null,
        event: entry.event,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
      });
    } catch (error) {
      console.error('auth_event не записался:', error instanceof Error ? error.message : error);
    }
  }
}
