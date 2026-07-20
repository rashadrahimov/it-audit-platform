import { Injectable } from '@nestjs/common';
import type {
  ConfigField,
  ConnectorProvider,
  SyncResult,
  TestConnectionResult,
} from '../connector-provider';

/**
 * T-V38: ручной провайдер — источник данных без внешней системы. Конфиг несёт
 * inline-список записей (JSON-массив объектов): реестр доступов/инвентарь/доказательства,
 * который аудитор ведёт руками. sync отдаёт эти записи как есть — их читают автотесты
 * (field_present) так же, как записи из LDAP. Полностью автономен (без сети/инфры).
 */
function parseRecords(config: Record<string, unknown>): Array<Record<string, unknown>> {
  const raw = config.records;
  const arr = typeof raw === 'string' ? (raw.trim() === '' ? [] : JSON.parse(raw)) : raw;
  if (!Array.isArray(arr)) throw new Error('records должен быть JSON-массивом объектов');
  return arr.map((r, i) => {
    if (r === null || typeof r !== 'object' || Array.isArray(r)) {
      throw new Error(`records[${i}] должен быть объектом`);
    }
    return r as Record<string, unknown>;
  });
}

@Injectable()
export class ManualConnectorProvider implements ConnectorProvider {
  readonly provider = 'manual';
  readonly capabilities = ['evidence', 'inventory', 'access'] as const;
  readonly label = 'Ручной источник (JSON)';
  readonly description =
    'Список записей, который аудитор ведёт вручную (реестр доступов, инвентарь, доказательства). Питает автотесты без внешней системы.';
  readonly configFields: readonly ConfigField[] = [
    {
      key: 'records',
      label: 'Записи (JSON-массив объектов)',
      type: 'json',
      required: true,
      placeholder: '[{"user":"a@corp","active":true}]',
    },
  ];

  async testConnection(config: Record<string, unknown>): Promise<TestConnectionResult> {
    try {
      const records = parseRecords(config);
      return { ok: true, message: `Разобрано записей: ${records.length}` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  async sync(config: Record<string, unknown>): Promise<SyncResult> {
    const records = parseRecords(config);
    return { records, stats: { records: records.length } };
  }
}
