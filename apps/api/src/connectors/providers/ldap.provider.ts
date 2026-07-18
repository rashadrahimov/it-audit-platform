import { Injectable } from '@nestjs/common';
import { Client } from 'ldapts';
import type { ConnectorProvider, SyncResult } from '../connector-provider';

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
