/**
 * Prod-bootstrap (T-I07): готовит чистую инсталляцию БЕЗ демо-данных —
 * глобальные референс-данные (роли/фреймворки/контроли/типы аудита/глоссарий) +
 * первый tenant и admin из env. Идемпотентно. Для docker-compose.prod.yml.
 *
 * Запуск (после миграций):
 *   BOOTSTRAP_TENANT_SLUG=acme BOOTSTRAP_TENANT_NAME="Acme" \
 *   BOOTSTRAP_ADMIN_EMAIL=admin@acme.io BOOTSTRAP_ADMIN_PASSWORD='...' \
 *   node apps/api/dist/bootstrap.js
 * Без BOOTSTRAP_* — сеет только референс-данные (admin не создаётся).
 */
import { Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { env } from './env';
import { membership, role, tenant, user } from './db/schema';
import { PasswordService } from './auth/password.service';
import {
  seedAuditTypes,
  seedGlobalControls,
  seedGlobalFrameworks,
  seedGlossary,
  seedPermissionCatalog,
  seedPresetRoles,
} from './seed';

async function seedReferenceData(): Promise<void> {
  const client = new Client({ connectionString: env.databaseUrl, connectionTimeoutMillis: 5000 });
  await client.connect();
  let catalog;
  try {
    catalog = await seedPermissionCatalog(drizzle(client));
    console.log(`✓ Каталог прав: ${catalog.length}`);
  } finally {
    await client.end().catch(() => {});
  }
  // управляют собственными owner-подключениями (глобальные строки под RLS-политикой записи)
  await seedPresetRoles(catalog);
  await seedGlobalFrameworks();
  await seedGlobalControls();
  await seedAuditTypes();
  await seedGlossary();
  console.log(
    '✓ Референс-данные: пресет-роли, фреймворки (вкл. CBAR), контроли, типы аудита, глоссарий',
  );
}

async function seedAdmin(): Promise<void> {
  const slug = process.env.BOOTSTRAP_TENANT_SLUG;
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!slug || !email || !password) {
    console.log('BOOTSTRAP_TENANT_SLUG/ADMIN_EMAIL/ADMIN_PASSWORD не заданы — admin не создаётся');
    return;
  }
  const name = process.env.BOOTSTRAP_TENANT_NAME ?? slug;
  const fullName = process.env.BOOTSTRAP_ADMIN_NAME ?? 'Administrator';

  const client = new Client({ connectionString: env.databaseUrl, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    const db = drizzle(client);
    await db
      .insert(tenant)
      .values({ slug, name, languageDefault: 'en' })
      .onConflictDoNothing({ target: tenant.slug });
    const [t] = await db.select().from(tenant).where(eq(tenant.slug, slug));
    if (!t) throw new Error(`tenant «${slug}» не создался`);

    const pw = new PasswordService();
    await db
      .insert(user)
      .values({
        email,
        fullName,
        passwordHash: await pw.hash(password),
        passwordChangedAt: new Date(),
      })
      .onConflictDoNothing({ target: user.email });
    const [u] = await db.select().from(user).where(eq(user.email, email));
    if (!u) throw new Error(`admin ${email} не создался`);

    const roles = await db.select().from(role).where(eq(role.isSystem, true));
    const adminRole = roles.find((r) => r.nameI18n.en === 'Admin');
    if (!adminRole) throw new Error('пресет-роль Admin не найдена — референс-данные не прошли?');

    await db
      .insert(membership)
      .values({ userId: u.id, tenantId: t.id, roleId: adminRole.id, isAuditSeat: true })
      .onConflictDoNothing();
    console.log(`✓ Bootstrap: tenant «${name}» (${slug}) + admin ${email} (роль Admin)`);
  } finally {
    await client.end().catch(() => {});
  }
}

async function main(): Promise<void> {
  console.log('Bootstrap: миграции должны быть применены (drizzle-kit migrate)');
  await seedReferenceData();
  await seedAdmin();
  console.log('Bootstrap завершён.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Bootstrap провалился:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
