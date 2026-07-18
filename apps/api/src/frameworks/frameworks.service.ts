import { BadRequestException, Injectable } from '@nestjs/common';
import { asc, eq, isNull } from 'drizzle-orm';
import { resolveLocalized, type Locale } from '@it-audit/shared';
import { DbService } from '../db/db.service';
import { framework, tenant } from '../db/schema';

export interface FrameworkListItem {
  id: string;
  name: string;
  nameI18n: { en: string; az?: string; ru?: string };
  version: string;
  status: string;
  /** true — глобальная библиотека (ADR-0016), false — адаптация тенанта. */
  isGlobal: boolean;
  sourceFrameworkId: string | null;
}

/**
 * Библиотека стандартов (T-030, ADR-0016). Без тенант-контекста RLS отдаёт
 * только глобальные строки; с tenantSlug — плюс адаптации тенанта.
 */
@Injectable()
export class FrameworksService {
  constructor(private readonly dbService: DbService) {}

  async list(tenantSlug: string | undefined, locale: Locale): Promise<FrameworkListItem[]> {
    const collect = (db: Pick<typeof this.dbService.db, 'select'>) =>
      db
        .select()
        .from(framework)
        .where(isNull(framework.deletedAt))
        .orderBy(asc(framework.createdAt));

    let rows;
    if (!tenantSlug) {
      rows = await collect(this.dbService.db);
    } else {
      const [found] = await this.dbService.db
        .select()
        .from(tenant)
        .where(eq(tenant.slug, tenantSlug));
      if (!found) throw new BadRequestException(`Тенант «${tenantSlug}» не найден`);
      rows = await this.dbService.withTenant(found.id, collect);
    }

    return rows.map((row) => ({
      id: row.id,
      name: resolveLocalized(row.nameI18n, locale),
      nameI18n: row.nameI18n,
      version: row.version,
      status: row.status,
      isGlobal: row.tenantId === null,
      sourceFrameworkId: row.sourceFrameworkId,
    }));
  }
}
