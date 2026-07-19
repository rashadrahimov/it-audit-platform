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
  // T-V23: справочник категорий рисков (переопределяется тенантом через PUT)
  risk_categories: [
    { code: 'access', labelI18n: { en: 'Access', ru: 'Доступ' } },
    { code: 'data', labelI18n: { en: 'Data', ru: 'Данные' } },
    { code: 'security', labelI18n: { en: 'Security', ru: 'Безопасность' } },
    { code: 'availability', labelI18n: { en: 'Availability', ru: 'Доступность' } },
    { code: 'change', labelI18n: { en: 'Change', ru: 'Изменения' } },
    { code: 'vendor', labelI18n: { en: 'Vendor', ru: 'Вендоры' } },
    { code: 'compliance', labelI18n: { en: 'Compliance', ru: 'Комплаенс' } },
    { code: 'people', labelI18n: { en: 'People', ru: 'Люди' } },
  ],
  // T-V13: справочник категорий вендоров (переопределяется тенантом через PUT)
  vendor_categories: [
    { code: 'cloud', labelI18n: { en: 'Cloud / Hosting', ru: 'Облако / Хостинг' } },
    { code: 'saas', labelI18n: { en: 'SaaS', ru: 'SaaS' } },
    { code: 'infrastructure', labelI18n: { en: 'Infrastructure', ru: 'Инфраструктура' } },
    { code: 'data_processor', labelI18n: { en: 'Data processor', ru: 'Обработчик данных' } },
    { code: 'consulting', labelI18n: { en: 'Consulting', ru: 'Консалтинг' } },
    { code: 'other', labelI18n: { en: 'Other', ru: 'Прочее' } },
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
    await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [current] = await tx
        .select()
        .from(configList)
        .where(and(eq(configList.tenantId, actor.tenantId), eq(configList.listKey, listKey)));
      if (current) {
        // TEC-03 (T-H02): снимок прошлой версии в history (максимум 20 последних)
        const snapshot = { items: current.items, at: new Date().toISOString(), by: actor.userId };
        const history = [snapshot, ...(current.history ?? [])].slice(0, 20);
        await tx.update(configList).set({ items, history }).where(eq(configList.id, current.id));
      } else {
        await tx.insert(configList).values({ tenantId: actor.tenantId, listKey, items });
      }
    });
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

  /** История версий списка (TEC-03, T-H02): снимки прошлых items, свежие сверху. */
  async getHistory(tenantId: string, listKey: string) {
    const [row] = await this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({ history: configList.history })
        .from(configList)
        .where(and(eq(configList.tenantId, tenantId), eq(configList.listKey, listKey))),
    );
    return { listKey, versions: row?.history ?? [] };
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
