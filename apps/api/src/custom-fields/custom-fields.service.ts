import { BadRequestException, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import type { I18nText } from '@it-audit/shared';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { customFieldDef } from '../db/schema';

interface Actor {
  tenantId: string;
  userId: string;
  ip?: string;
}

export const FIELD_TYPES = ['text', 'number', 'date', 'select', 'boolean'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

@Injectable()
export class CustomFieldsService {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async define(
    actor: Actor,
    input: {
      entityType: string;
      key: string;
      labelI18n: I18nText;
      fieldType: FieldType;
      options?: string[];
      required?: boolean;
    },
  ) {
    const created = await this.dbService.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(customFieldDef)
        .values({
          tenantId: actor.tenantId,
          entityType: input.entityType,
          key: input.key,
          labelI18n: input.labelI18n,
          fieldType: input.fieldType,
          options: input.options ?? [],
          required: input.required ?? false,
        })
        .onConflictDoNothing({
          target: [customFieldDef.tenantId, customFieldDef.entityType, customFieldDef.key],
        })
        .returning();
      if (!row)
        throw new BadRequestException(`Поле «${input.key}» для ${input.entityType} уже определено`);
      return row;
    });
    await this.auditLogService.record({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorIp: actor.ip,
      action: 'custom_field_def.created',
      entityType: 'custom_field_def',
      entityId: created.id,
      after: { entityType: created.entityType, key: created.key },
    });
    return { id: created.id, key: created.key };
  }

  async listFor(tenantId: string, entityType: string) {
    return this.dbService.withTenant(tenantId, (tx) =>
      tx
        .select({
          key: customFieldDef.key,
          labelI18n: customFieldDef.labelI18n,
          fieldType: customFieldDef.fieldType,
          options: customFieldDef.options,
          required: customFieldDef.required,
        })
        .from(customFieldDef)
        .where(and(eq(customFieldDef.entityType, entityType), isNull(customFieldDef.deletedAt))),
    );
  }

  /** Валидировать payload значений custom-полей по определениям entity_type (GEN-07). */
  async validate(tenantId: string, entityType: string, values: Record<string, unknown>) {
    const defs = await this.listFor(tenantId, entityType);
    for (const def of defs) {
      const v = values[def.key];
      if (v === undefined || v === null || v === '') {
        if (def.required) throw new BadRequestException(`Поле «${def.key}» обязательно`);
        continue;
      }
      this.checkType(def.key, def.fieldType, def.options as string[], v);
    }
    // неизвестные ключи не запрещаем жёстко — но сообщаем через отфильтрованный результат
    const known = new Set(defs.map((d) => d.key));
    const unknown = Object.keys(values).filter((k) => !known.has(k));
    if (unknown.length > 0) {
      throw new BadRequestException(`Неизвестные custom-поля: ${unknown.join(', ')}`);
    }
    return { valid: true, checked: defs.length };
  }

  private checkType(key: string, fieldType: string, options: string[], v: unknown) {
    switch (fieldType) {
      case 'text':
        if (typeof v !== 'string') throw new BadRequestException(`«${key}»: ожидается строка`);
        break;
      case 'number':
        if (typeof v !== 'number') throw new BadRequestException(`«${key}»: ожидается число`);
        break;
      case 'boolean':
        if (typeof v !== 'boolean') throw new BadRequestException(`«${key}»: ожидается boolean`);
        break;
      case 'date':
        if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) {
          throw new BadRequestException(`«${key}»: ожидается ISO-дата`);
        }
        break;
      case 'select':
        if (typeof v !== 'string' || !options.includes(v)) {
          throw new BadRequestException(`«${key}»: значение вне списка [${options.join(', ')}]`);
        }
        break;
      default:
        throw new BadRequestException(`«${key}»: неизвестный тип поля ${fieldType}`);
    }
  }
}
