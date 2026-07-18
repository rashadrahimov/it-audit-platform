import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { I18nText } from '@it-audit/shared';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { configList } from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

export interface ListItem {
  code: string;
  labelI18n: I18nText;
}

/** Дефолтные настраиваемые списки (ENG-09 audit_opinion и т.п.). Тенант переопределяет. */
export const DEFAULT_LISTS: Record<string, ListItem[]> = {
  audit_opinion: [
    { code: 'satisfactory', labelI18n: { en: 'Satisfactory', ru: 'Удовлетворительно' } },
    { code: 'needs_improvement', labelI18n: { en: 'Needs improvement', ru: 'Требует улучшения' } },
    { code: 'unsatisfactory', labelI18n: { en: 'Unsatisfactory', ru: 'Неудовлетворительно' } },
  ],
};

@Injectable()
export class ConfigListsService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /** Эффективный список: переопределение тенанта, иначе дефолт; неизвестный ключ→404. */
  async get(
    tenantId: string,
    listKey: string,
  ): Promise<{ listKey: string; items: ListItem[]; isDefault: boolean }> {
    const [override] = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select()
        .from(configList)
        .where(and(eq(configList.tenantId, tenantId), eq(configList.listKey, listKey))),
    );
    if (override) {
      return { listKey, items: override.items as ListItem[], isDefault: false };
    }
    const def = DEFAULT_LISTS[listKey];
    if (!def) throw new NotFoundException(`Список «${listKey}» не найден`);
    return { listKey, items: def, isDefault: true };
  }

  async set(actor: Actor, listKey: string, items: ListItem[]) {
    if (items.length === 0) throw new BadRequestException('Список не может быть пустым');
    const codes = items.map((i) => i.code);
    if (new Set(codes).size !== codes.length) {
      throw new BadRequestException('Коды элементов списка должны быть уникальны');
    }
    await this.dbService.withTenant(actor.tenantId, (tx) =>
      tx
        .insert(configList)
        .values({ tenantId: actor.tenantId, listKey, items })
        .onConflictDoUpdate({ target: [configList.tenantId, configList.listKey], set: { items } }),
    );
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'config_list.updated',
      entityType: 'config_list',
      entityId: listKey,
      after: { count: items.length },
    });
    return { listKey, count: items.length };
  }

  /** Проверить, что code входит в эффективный список (иначе 400). */
  async validateValue(tenantId: string, listKey: string, code: string) {
    const { items } = await this.get(tenantId, listKey);
    if (!items.some((i) => i.code === code)) {
      throw new BadRequestException(`Значение «${code}» вне списка «${listKey}»`);
    }
    return { valid: true };
  }
}
