import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Client, InvalidCredentialsError } from 'ldapts';
import type { AuthTokenResponse, LdapLoginRequest } from '@it-audit/shared';
import { AuditLogService } from '../audit/audit-log.service';
import { env } from '../env';
import { AuthService, type RequestMeta } from './auth.service';
import { SsoUserService } from './sso-user.service';

/**
 * LDAP-федерация (T-025, ADR-0006): логин по учётке локального AD on-prem клиента.
 * Search+bind: сервисный аккаунт находит DN по фильтру, затем bind кредами юзера —
 * пароль проверяет сам LDAP, у нас он нигде не сохраняется. JIT — SsoUserService.
 * Парольная политика/lockout локальных аккаунтов не применяются: пароль чужой (AD).
 */
@Injectable()
export class LdapService {
  constructor(
    private readonly authService: AuthService,
    private readonly ssoUserService: SsoUserService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async login(request: LdapLoginRequest, meta: RequestMeta): Promise<AuthTokenResponse> {
    const entry = await this.findUser(request.username);
    // одинаковый ответ для «нет юзера» и «не тот пароль» — не раскрываем, кто есть в AD
    if (!entry) throw await this.failed(meta);

    const userClient = new Client({ url: env.ldapUrl });
    try {
      await userClient.bind(entry.dn, request.password);
    } catch (error) {
      if (error instanceof InvalidCredentialsError) throw await this.failed(meta);
      throw error;
    } finally {
      await userClient.unbind().catch(() => undefined);
    }

    const email = firstString(entry.mail)?.toLowerCase();
    if (!email) throw new UnauthorizedException('У LDAP-учётки нет mail — вход невозможен');
    const fullName = firstString(entry.displayName) ?? firstString(entry.cn);

    const ssoUser = await this.ssoUserService.provisionUser(email, fullName);
    return this.authService.issueTokenForUser(ssoUser.id, meta);
  }

  /** Поиск DN сервисным аккаунтом; значение юзера экранируется (RFC 4515) от инъекции в фильтр. */
  private async findUser(username: string) {
    const client = new Client({ url: env.ldapUrl });
    try {
      await client.bind(env.ldapBindDn, env.ldapBindPassword);
      const { searchEntries } = await client.search(env.ldapSearchBase, {
        scope: 'sub',
        filter: env.ldapSearchFilter.replaceAll('{{username}}', escapeFilterValue(username)),
        attributes: ['mail', 'cn', 'displayName'],
        sizeLimit: 2,
      });
      // неоднозначный фильтр (нашлось двое) — отказ, а не вход «в первого попавшегося»
      return searchEntries.length === 1 ? searchEntries[0] : undefined;
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }

  private async failed(meta: RequestMeta): Promise<UnauthorizedException> {
    await this.auditLogService.recordAuthEvent({ event: 'failed', ...meta });
    return new UnauthorizedException('Неверные LDAP-креды');
  }
}

function escapeFilterValue(value: string): string {
  // RFC 4515: \ ( ) * и NUL кодируются как \xx
  return value.replace(/[\\()*\0]/g, (ch) => `\\${ch.charCodeAt(0).toString(16).padStart(2, '0')}`);
}

function firstString(value: unknown): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first === 'string' && first) return first;
  if (Buffer.isBuffer(first)) return first.toString('utf8');
  return undefined;
}
