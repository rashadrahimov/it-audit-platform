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

export interface CustomFieldValidationDefinition {
  key: string;
  fieldType: string;
  options: unknown;
  required: boolean;
}

export interface CustomFieldValidationOptions {
  allowUnknownWhenNoDefinitions?: boolean;
  reservedKeys?: string[];
}

function optionsArray(options: unknown): string[] {
  return Array.isArray(options)
    ? options.filter((item): item is string => typeof item === 'string')
    : [];
}

function assertCustomFieldType(key: string, fieldType: string, options: string[], v: unknown) {
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

export function validateCustomFieldValues(
  defs: CustomFieldValidationDefinition[],
  values: Record<string, unknown>,
  options: CustomFieldValidationOptions = {},
) {
  if (defs.length === 0 && options.allowUnknownWhenNoDefinitions) {
    return { valid: true, checked: 0 };
  }

  const reserved = new Set(options.reservedKeys ?? []);
  for (const def of defs) {
    const v = values[def.key];
    if (v === undefined || v === null || v === '') {
      if (def.required) throw new BadRequestException(`Поле «${def.key}» обязательно`);
      continue;
    }
    assertCustomFieldType(def.key, def.fieldType, optionsArray(def.options), v);
  }

  const known = new Set(defs.map((d) => d.key));
  const unknown = Object.keys(values).filter((k) => !known.has(k) && !reserved.has(k));
  if (unknown.length > 0) {
    throw new BadRequestException(`Неизвестные custom-поля: ${unknown.join(', ')}`);
  }
  return { valid: true, checked: defs.length };
}

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
    return validateCustomFieldValues(defs, values);
  }

  /**
   * Проверка для write-path доменных сущностей.
   *
   * Если definitions ещё не заведены, не ломаем legacy/custom payload. Но как только
   * tenant определил хотя бы одно поле для entityType, включается строгий контракт:
   * required/type/select и запрет неизвестных ключей. Для PATCH валидируем merged
   * состояние, чтобы required поля могли уже лежать в существующей записи.
   */
  async validateForWrite(
    tenantId: string,
    entityType: string,
    values: Record<string, unknown> | undefined,
    options: {
      existing?: Record<string, unknown> | null;
      partial?: boolean;
      reservedKeys?: string[];
    } = {},
  ) {
    const incoming = values ?? {};
    const merged = options.partial ? { ...(options.existing ?? {}), ...incoming } : incoming;
    const defs = await this.listFor(tenantId, entityType);
    validateCustomFieldValues(defs, merged, {
      allowUnknownWhenNoDefinitions: true,
      reservedKeys: options.reservedKeys,
    });
    return merged;
  }
}
