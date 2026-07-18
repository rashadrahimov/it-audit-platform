import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { apiKey } from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /** Сгенерировать ключ: plaintext возвращается ОДИН раз, в БД — только SHA-256 хэш. */
  async generate(actor: Actor, name: string) {
    const secret = randomBytes(24).toString('hex');
    const fullKey = `iap_${secret}`;
    const prefix = fullKey.slice(0, 12);
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(apiKey)
        .values({ tenantId: actor.tenantId, name, keyHash: hashKey(fullKey), prefix })
        .returning();
      if (!row) throw new Error('Ключ не создался');
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'api_key.created',
      entityType: 'api_key',
      entityId: created.id,
      after: { name, prefix },
    });
    // key показывается единожды
    return { id: created.id, name, prefix, key: fullKey };
  }

  /** Аутентификация по ключу: глобальный lookup по хэшу (RLS auth_read), обновляет last_used_at. */
  async authenticate(rawKey: string): Promise<{ tenantId: string; apiKeyId: string } | null> {
    if (!rawKey || !rawKey.startsWith('iap_')) return null;
    const hash = hashKey(rawKey);
    const [row] = await this.dbService.db
      .select({ id: apiKey.id, tenantId: apiKey.tenantId, revokedAt: apiKey.revokedAt })
      .from(apiKey)
      .where(eq(apiKey.keyHash, hash));
    if (!row || row.revokedAt) return null;
    await this.dbService.db
      .update(apiKey)
      .set({ lastUsedAt: sql`now()` })
      .where(eq(apiKey.id, row.id));
    return { tenantId: row.tenantId, apiKeyId: row.id };
  }

  async list(tenantId: string) {
    const rows = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({
          id: apiKey.id,
          name: apiKey.name,
          prefix: apiKey.prefix,
          lastUsedAt: apiKey.lastUsedAt,
          revokedAt: apiKey.revokedAt,
        })
        .from(apiKey)
        // явный фильтр по тенанту (SELECT-политика auth_read разрешает всё — админ-список сужаем в коде)
        .where(eq(apiKey.tenantId, tenantId))
        .orderBy(desc(apiKey.createdAt)),
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      prefix: r.prefix,
      lastUsedAt: r.lastUsedAt,
      revoked: r.revokedAt !== null,
    }));
  }

  async revoke(actor: Actor, id: string) {
    const affected = await this.dbService.withTenant(actor.tenantId, (tx) =>
      tx
        .update(apiKey)
        .set({ revokedAt: sql`now()` })
        .where(and(eq(apiKey.id, id), eq(apiKey.tenantId, actor.tenantId), isNull(apiKey.revokedAt)))
        .returning({ id: apiKey.id }),
    );
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'api_key.revoked',
      entityType: 'api_key',
      entityId: id,
    });
    return { revoked: affected.length > 0 };
  }
}
