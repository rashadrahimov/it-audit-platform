import { Injectable } from '@nestjs/common';
import { Client } from 'ldapts';
import type {
  ConfigField,
  ConnectorProvider,
  SyncResult,
  TestConnectionResult,
} from '../connector-provider';

interface LdapConfig {
  url: string;
  bindDn: string;
  bindPassword: string;
  searchBase: string;
  searchFilter?: string;
}

function asLdapConfig(config: Record<string, unknown>): LdapConfig {
  const url = config.url;
  const bindDn = config.bindDn;
  const bindPassword = config.bindPassword;
  const searchBase = config.searchBase;
  if (
    typeof url !== 'string' ||
    typeof bindDn !== 'string' ||
    typeof bindPassword !== 'string' ||
    typeof searchBase !== 'string'
  ) {
    throw new Error('LDAP config: нужны url, bindDn, bindPassword, searchBase');
  }
  return {
    url,
    bindDn,
    bindPassword,
    searchBase,
    searchFilter:
      typeof config.searchFilter === 'string' ? config.searchFilter : '(objectClass=person)',
  };
}

const str = (v: unknown): string | null =>
  typeof v === 'string' ? v : Array.isArray(v) && typeof v[0] === 'string' ? v[0] : null;

/**
 * LDAP-провайдер (T-049): тянет персонал/аккаунты из локального AD (ldapts, T-025).
 * capability personnel+access — питает синхронизацию сотрудников и реестр аккаунтов.
 */
@Injectable()
export class LdapConnectorProvider implements ConnectorProvider {
  readonly provider = 'ldap';
  readonly capabilities = ['personnel', 'access'] as const;
  readonly label = 'LDAP / Active Directory';
  readonly description =
    'Синхронизация сотрудников и учётных записей из локального каталога (LDAP/AD) — без выхода в интернет.';
  readonly configFields: readonly ConfigField[] = [
    {
      key: 'url',
      label: 'URL сервера',
      type: 'url',
      required: true,
      placeholder: 'ldap://dc.corp.local:389',
    },
    {
      key: 'bindDn',
      label: 'Bind DN',
      type: 'text',
      required: true,
      placeholder: 'cn=svc,dc=corp,dc=local',
    },
    { key: 'bindPassword', label: 'Пароль', type: 'password', required: true, secret: true },
    {
      key: 'searchBase',
      label: 'Search Base',
      type: 'text',
      required: true,
      placeholder: 'ou=people,dc=corp,dc=local',
    },
    {
      key: 'searchFilter',
      label: 'Search Filter',
      type: 'text',
      required: false,
      placeholder: '(objectClass=person)',
    },
  ];

  /** T-V38: bind+unbind без поиска — проверяет доступность сервера и креды. */
  async testConnection(rawConfig: Record<string, unknown>): Promise<TestConnectionResult> {
    let config: LdapConfig;
    try {
      config = asLdapConfig(rawConfig);
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
    const client = new Client({ url: config.url, timeout: 5000, connectTimeout: 5000 });
    try {
      await client.bind(config.bindDn, config.bindPassword);
      return { ok: true, message: `Bind OK: ${config.url}` };
    } catch (error) {
      return {
        ok: false,
        message: `Не удалось подключиться: ${error instanceof Error ? error.message : String(error)}`,
      };
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }

  async sync(rawConfig: Record<string, unknown>): Promise<SyncResult> {
    const config = asLdapConfig(rawConfig);
    const client = new Client({ url: config.url });
    try {
      await client.bind(config.bindDn, config.bindPassword);
      const { searchEntries } = await client.search(config.searchBase, {
        scope: 'sub',
        filter: config.searchFilter,
        attributes: ['uid', 'cn', 'mail', 'sn', 'givenName'],
      });
      const records = searchEntries.map((e) => ({
        dn: e.dn,
        uid: str(e.uid),
        fullName: str(e.cn),
        email: str(e.mail),
      }));
      return {
        records,
        stats: {
          accounts: records.length,
          withEmail: records.filter((r) => r.email).length,
        },
      };
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }
}
