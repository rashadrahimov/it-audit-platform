import { Injectable } from '@nestjs/common';
import type {
  ConfigField,
  ConnectorProvider,
  SyncResult,
  TestConnectionResult,
} from '../connector-provider';

interface HttpJsonConfig {
  url: string;
  authorization?: string;
  recordsPath?: string;
}

function asConfig(config: Record<string, unknown>): HttpJsonConfig {
  const url = config.url;
  if (typeof url !== 'string' || url.trim() === '') {
    throw new Error('HTTP-JSON config: нужен url');
  }
  if (!/^https?:\/\//i.test(url)) throw new Error('url должен начинаться с http(s)://');
  return {
    url,
    authorization: typeof config.authorization === 'string' ? config.authorization : undefined,
    recordsPath: typeof config.recordsPath === 'string' ? config.recordsPath : undefined,
  };
}

/** Достать массив по dot-пути (data.items). Пусто → сам json. Один объект → [объект]. */
export function extractRecords(json: unknown, path?: string): Array<Record<string, unknown>> {
  let node: unknown = json;
  if (path && path.trim() !== '') {
    for (const key of path.split('.')) {
      if (node === null || typeof node !== 'object') {
        throw new Error(`recordsPath «${path}»: нет ключа «${key}»`);
      }
      node = (node as Record<string, unknown>)[key];
      if (node === undefined) {
        throw new Error(`recordsPath «${path}»: нет ключа «${key}»`);
      }
    }
  }
  const arr = Array.isArray(node) ? node : node && typeof node === 'object' ? [node] : null;
  if (!arr) throw new Error('Ответ не содержит объектов/массива по recordsPath');
  return arr.map((r, i) => {
    if (r === null || typeof r !== 'object' || Array.isArray(r)) {
      throw new Error(`Элемент [${i}] не объект`);
    }
    return r as Record<string, unknown>;
  });
}

/**
 * T-V39: универсальный HTTP-JSON провайдер. Любая система с REST/JSON-API (облако,
 * сканер уязвимостей, трекер тикетов, VCS, vendor-discovery) подключается указанием
 * URL + опционального заголовка Authorization; массив записей достаётся по recordsPath
 * и питает автотесты так же, как LDAP/manual. On-prem-friendly: URL может быть внутренним.
 * Глубокие нативные адаптеры конкретных вендоров (пагинация, OAuth, проекция в домен) —
 * отдельная работа, требующая живых кред клиента.
 */
@Injectable()
export class HttpJsonConnectorProvider implements ConnectorProvider {
  readonly provider: string = 'http_json';
  readonly capabilities: readonly string[] = [
    'evidence',
    'inventory',
    'access',
    'vulns',
    'discovery',
    'code',
  ] as const;
  readonly label: string = 'HTTP / JSON API';
  readonly description: string =
    'Универсальный коннектор к любому REST/JSON-API: облако, сканер уязвимостей, трекер задач, VCS, обнаружение вендоров. URL + опциональный Authorization.';
  readonly configFields: readonly ConfigField[] = [
    {
      key: 'url',
      label: 'URL эндпоинта',
      type: 'url',
      required: true,
      placeholder: 'https://api.example.com/v1/resources',
    },
    {
      key: 'authorization',
      label: 'Заголовок Authorization',
      type: 'password',
      required: false,
      secret: true,
      placeholder: 'Bearer <token> / token <pat>',
    },
    {
      key: 'recordsPath',
      label: 'Путь к массиву (dot-path)',
      type: 'text',
      required: false,
      placeholder: 'data.items',
    },
  ];

  private async fetchJson(config: HttpJsonConfig): Promise<unknown> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (config.authorization) headers.Authorization = config.authorization;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(config.url, { headers, signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async testConnection(rawConfig: Record<string, unknown>): Promise<TestConnectionResult> {
    let config: HttpJsonConfig;
    try {
      config = asConfig(rawConfig);
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
    try {
      const json = await this.fetchJson(config);
      const records = extractRecords(json, config.recordsPath);
      return { ok: true, message: `OK: получено записей ${records.length}` };
    } catch (error) {
      return {
        ok: false,
        message: `Не удалось: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async sync(rawConfig: Record<string, unknown>): Promise<SyncResult> {
    const config = asConfig(rawConfig);
    const json = await this.fetchJson(config);
    const records = extractRecords(json, config.recordsPath);
    return { records, stats: { records: records.length } };
  }
}

/**
 * T-H100: Jira/ticketing preset. It intentionally reuses the hardened HTTP/JSON
 * runtime (encrypted config, sync_run history, testConnection) while making the
 * requirement-visible ticketing evidence source explicit in the catalog.
 */
@Injectable()
export class TicketingJsonConnectorProvider extends HttpJsonConnectorProvider {
  override readonly provider = 'ticketing_jira_json';
  override readonly capabilities = ['tickets', 'tasks', 'evidence'] as const;
  override readonly label = 'Ticketing / Jira REST';
  override readonly description =
    'Pull change tickets, remediation tasks or Jira issues from a REST/JSON endpoint for audit evidence and action-plan follow-up.';
  override readonly configFields: readonly ConfigField[] = [
    {
      key: 'url',
      label: 'Jira/search URL',
      type: 'url',
      required: true,
      placeholder: 'https://jira.example.com/rest/api/3/search?jql=project=ITGC',
    },
    {
      key: 'authorization',
      label: 'Authorization header',
      type: 'password',
      required: false,
      secret: true,
      placeholder: 'Bearer <token> / Basic <base64>',
    },
    {
      key: 'recordsPath',
      label: 'Issues array path',
      type: 'text',
      required: false,
      placeholder: 'issues',
    },
  ];
}

/**
 * T-H100: Cloud configuration preset for AWS/Azure/GCP inventory or posture
 * exports exposed through an internal REST/JSON collector.
 */
@Injectable()
export class CloudConfigJsonConnectorProvider extends HttpJsonConnectorProvider {
  override readonly provider = 'cloud_config_json';
  override readonly capabilities = ['cloud', 'inventory', 'evidence'] as const;
  override readonly label = 'Cloud config REST';
  override readonly description =
    'Pull cloud configuration inventory or posture findings from AWS/Azure/GCP collectors exposed as REST/JSON.';
  override readonly configFields: readonly ConfigField[] = [
    {
      key: 'url',
      label: 'Cloud collector URL',
      type: 'url',
      required: true,
      placeholder: 'https://collector.internal/cloud/resources',
    },
    {
      key: 'authorization',
      label: 'Authorization header',
      type: 'password',
      required: false,
      secret: true,
      placeholder: 'Bearer <token>',
    },
    {
      key: 'recordsPath',
      label: 'Resources array path',
      type: 'text',
      required: false,
      placeholder: 'data.resources',
    },
  ];
}

/**
 * T-H100: SIEM/log-source preset for Splunk/Elastic/Sentinel exports exposed by
 * an internal JSON endpoint. Draft signals still pass through auditor review gates.
 */
@Injectable()
export class SiemLogsJsonConnectorProvider extends HttpJsonConnectorProvider {
  override readonly provider = 'siem_logs_json';
  override readonly capabilities = ['logs', 'evidence', 'vulns'] as const;
  override readonly label = 'SIEM / log source REST';
  override readonly description =
    'Pull SIEM events, alert exports or log evidence from Splunk/Elastic/Sentinel-style REST/JSON sources.';
  override readonly configFields: readonly ConfigField[] = [
    {
      key: 'url',
      label: 'SIEM export URL',
      type: 'url',
      required: true,
      placeholder: 'https://siem.internal/api/search/export',
    },
    {
      key: 'authorization',
      label: 'Authorization header',
      type: 'password',
      required: false,
      secret: true,
      placeholder: 'Bearer <token>',
    },
    {
      key: 'recordsPath',
      label: 'Events array path',
      type: 'text',
      required: false,
      placeholder: 'results',
    },
  ];
}
