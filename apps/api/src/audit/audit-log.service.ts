import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { auditLog, authEvent } from '../db/schema';

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
  event: 'login' | 'logout' | 'failed' | 'locked';
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Журналы (T-021). Запись не должна ронять бизнес-операцию — ошибки глотаются
 * с логом в stderr; hash-chain добавится в EP-HARDEN.
 */
@Injectable()
export class AuditLogService {
  constructor(private readonly dbService: DbService) {}

  async record(entry: AuditRecord): Promise<void> {
    try {
      await this.dbService.db.insert(auditLog).values({
        tenantId: entry.tenantId ?? null,
        actorUserId: entry.actorUserId ?? null,
        actorIp: entry.actorIp ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        before: entry.before ?? null,
        after: entry.after ?? null,
      });
    } catch (error) {
      console.error('audit_log не записался:', error instanceof Error ? error.message : error);
    }
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
