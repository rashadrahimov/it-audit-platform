import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import {
  createAuditTypeAction,
  createTagAction,
  saveBusinessProfileAction,
  saveSlaConfigAction,
} from './actions';
import { EmptyState } from '@/components/empty-state';

export const dynamic = 'force-dynamic';

interface Tag {
  id: string;
  name: string;
  color: string | null;
}
interface AuditType {
  id: string;
  code: string;
  name: string;
  isGlobal: boolean;
}
interface SlaWindows {
  critical: number;
  high: number;
  medium: number;
  low: number;
  dueSoonDays: number;
}
const DEFAULT_SLA: SlaWindows = { critical: 7, high: 30, medium: 90, low: 180, dueSoonDays: 7 };
interface BusinessProfile {
  legalName: string;
  jurisdiction: string;
  address: string;
  incidentContact: string;
  securityContact: string;
  idleTimeoutMin: number;
  defaultLocale: 'en' | 'az' | 'ru';
  supportAccess: boolean;
  requireMfa: boolean;
}
const EMPTY_PROFILE: BusinessProfile = {
  legalName: '',
  jurisdiction: '',
  address: '',
  incidentContact: '',
  securityContact: '',
  idleTimeoutMin: 0,
  defaultLocale: 'en',
  supportAccess: false,
  requireMfa: false,
};

const inputCls =
  'rounded-md border border-border px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
const btnCls =
  'rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

/** Настройки тенанта (T-084/T-076): справочник типов аудита + теги. */
export default async function ConfigPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug] = await Promise.all([getTranslations('config'), getActiveTenantSlug()]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const [typesRes, tagsRes, slaRes, bizRes] = await Promise.all([
    apiFetch('/audit-types', { headers }),
    apiFetch('/tags', { headers }),
    apiFetch('/sla-config', { headers }),
    apiFetch('/business-profile', { headers }),
  ]);
  const types: AuditType[] = typesRes.ok ? await typesRes.json() : [];
  const tags: Tag[] = tagsRes.ok ? await tagsRes.json() : [];
  const sla: SlaWindows = slaRes.ok ? await slaRes.json() : DEFAULT_SLA;
  const biz: BusinessProfile = bizRes.ok ? await bizRes.json() : EMPTY_PROFILE;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>

      {/* Бизнес-профиль (T-V36a) */}
      <section className="flex flex-col gap-3" data-testid="business-profile">
        <h2 className="text-sm font-semibold text-secondary">{t('bizTitle')}</h2>
        <p className="text-xs text-secondary">{t('bizHint')}</p>
        <form
          action={saveBusinessProfileAction}
          data-testid="business-profile-form"
          className="grid gap-3 rounded-xl border border-border bg-white p-4 shadow-sm sm:grid-cols-2"
        >
          {(
            ['legalName', 'jurisdiction', 'address', 'incidentContact', 'securityContact'] as const
          ).map((f) => (
            <label key={f} className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium text-secondary">{t(f)}</span>
              <input name={f} defaultValue={biz[f]} className={inputCls} />
            </label>
          ))}
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-secondary">{t('idleTimeout')}</span>
            <input
              name="idleTimeoutMin"
              type="number"
              min={0}
              max={1440}
              defaultValue={biz.idleTimeoutMin}
              data-testid="idle-timeout"
              className={inputCls}
            />
            <span className="text-[11px] text-secondary">{t('idleTimeoutHint')}</span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs font-medium text-secondary">{t('defaultLocale')}</span>
            <select
              name="defaultLocale"
              defaultValue={biz.defaultLocale}
              data-testid="default-locale"
              className={inputCls}
            >
              <option value="en">English</option>
              <option value="az">Azərbaycanca</option>
              <option value="ru">Русский</option>
            </select>
            <span className="text-[11px] text-secondary">{t('defaultLocaleHint')}</span>
          </label>
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              name="supportAccess"
              defaultChecked={biz.supportAccess}
              data-testid="support-access"
              className="mt-0.5 h-4 w-4 rounded border-border text-accent focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="flex flex-col">
              <span className="text-xs font-medium text-secondary">{t('supportAccess')}</span>
              <span className="text-[11px] text-secondary">{t('supportAccessHint')}</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              name="requireMfa"
              defaultChecked={biz.requireMfa}
              data-testid="require-mfa"
              className="mt-0.5 h-4 w-4 rounded border-border text-accent focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="flex flex-col">
              <span className="text-xs font-medium text-secondary">{t('requireMfa')}</span>
              <span className="text-[11px] text-secondary">{t('requireMfaHint')}</span>
            </span>
          </label>
          <button
            type="submit"
            data-testid="business-profile-save"
            className={`${btnCls} sm:col-span-2 sm:justify-self-start`}
          >
            {t('bizSave')}
          </button>
        </form>
      </section>

      {/* Типы аудита */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-secondary">{t('auditTypes')}</h2>
        <form
          action={createAuditTypeAction}
          data-testid="audit-type-create"
          className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
        >
          <input
            name="code"
            required
            placeholder={t('codePh')}
            aria-label={t('codePh')}
            className={inputCls}
          />
          <input
            name="name"
            required
            placeholder={t('namePh')}
            aria-label={t('namePh')}
            className={`flex-1 ${inputCls}`}
          />
          <button type="submit" className={btnCls}>
            {t('add')}
          </button>
        </form>
        <ul className="flex flex-wrap gap-2" data-testid="audit-types-list">
          {types.map((at) => (
            <li
              key={at.id}
              className="flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1 text-sm shadow-sm"
            >
              <span className="font-medium text-foreground">{at.name}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  at.isGlobal ? 'bg-muted text-secondary' : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {at.isGlobal ? t('global') : t('custom')}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* SLA-окна ремедиации (T-V32) */}
      <section className="flex flex-col gap-3" data-testid="sla-config">
        <h2 className="text-sm font-semibold text-secondary">{t('slaTitle')}</h2>
        <p className="text-xs text-secondary">{t('slaHint')}</p>
        <form
          action={saveSlaConfigAction}
          data-testid="sla-config-form"
          className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
        >
          {(['critical', 'high', 'medium', 'low'] as const).map((sev) => (
            <label key={sev} className="flex w-24 flex-col gap-1 text-sm">
              <span className="font-medium text-secondary">{t(`sev.${sev}`)}</span>
              <input
                name={sev}
                type="number"
                min={1}
                max={3650}
                defaultValue={sla[sev]}
                className={inputCls}
              />
            </label>
          ))}
          <label className="flex w-28 flex-col gap-1 text-sm">
            <span className="font-medium text-secondary">{t('dueSoon')}</span>
            <input
              name="dueSoonDays"
              type="number"
              min={1}
              max={3650}
              defaultValue={sla.dueSoonDays}
              className={inputCls}
            />
          </label>
          <button type="submit" data-testid="sla-config-save" className={btnCls}>
            {t('slaSave')}
          </button>
        </form>
        <p className="text-xs text-secondary">{t('slaDays')}</p>
      </section>

      {/* Теги */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-secondary">{t('tags')}</h2>
        <form
          action={createTagAction}
          data-testid="tag-create"
          className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
        >
          <input
            name="name"
            required
            placeholder={t('tagPh')}
            aria-label={t('tagPh')}
            className={`flex-1 ${inputCls}`}
          />
          <input
            name="color"
            type="color"
            defaultValue="#07865F"
            className="h-10 w-14 rounded-md border border-border"
            aria-label={t('color')}
          />
          <button type="submit" className={btnCls}>
            {t('add')}
          </button>
        </form>
        {tags.length === 0 ? (
          <div className="rounded-xl border border-border bg-white shadow-sm">
            <EmptyState size="sm" text={t('empty')} />
          </div>
        ) : (
          <ul className="flex flex-wrap gap-2" data-testid="tags-list">
            {tags.map((tag) => (
              <li
                key={tag.id}
                className="flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1 text-sm shadow-sm"
              >
                <span
                  className="inline-block h-3 w-3 rounded-full border border-border"
                  style={{ backgroundColor: tag.color ?? 'transparent' }}
                  aria-hidden
                />
                <span className="font-medium text-foreground">{tag.name}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
