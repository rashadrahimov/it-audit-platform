import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch, getActiveTenantSlug, getSessionUser } from '@/lib/session';
import {
  createAuditTypeAction,
  createConfigListItemAction,
  createCustomFieldAction,
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
interface CustomFieldDef {
  key: string;
  labelI18n?: Record<string, string>;
  fieldType: string;
  options?: string[];
  required: boolean;
}
interface ConfigListItem {
  code: string;
  labelI18n?: Record<string, string>;
}
interface ConfigList {
  listKey: string;
  items: ConfigListItem[];
  isDefault: boolean;
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
const entityTypes = ['asset', 'engagement', 'risk', 'working_paper', 'vendor_intake'] as const;
const fieldTypes = ['text', 'number', 'date', 'select', 'boolean'] as const;
const configListKeys = ['audit_opinion', 'risk_categories', 'vendor_categories'] as const;

/** Настройки тенанта (T-084/T-076): справочник типов аудита + теги. */
export default async function ConfigPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const [t, tenantSlug] = await Promise.all([getTranslations('config'), getActiveTenantSlug()]);
  const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

  const [[typesRes, tagsRes, slaRes, bizRes], customFieldResponses, configListResponses] =
    await Promise.all([
      Promise.all([
        apiFetch('/audit-types', { headers }),
        apiFetch('/tags', { headers }),
        apiFetch('/sla-config', { headers }),
        apiFetch('/business-profile', { headers }),
      ]),
      Promise.all(
        entityTypes.map((entityType) =>
          apiFetch(`/custom-fields?entityType=${encodeURIComponent(entityType)}`, { headers }),
        ),
      ),
      Promise.all(
        configListKeys.map((listKey) =>
          apiFetch(`/config-lists/${encodeURIComponent(listKey)}`, { headers }),
        ),
      ),
    ]);
  const types: AuditType[] = typesRes.ok ? await typesRes.json() : [];
  const tags: Tag[] = tagsRes.ok ? await tagsRes.json() : [];
  const sla: SlaWindows = slaRes.ok ? await slaRes.json() : DEFAULT_SLA;
  const biz: BusinessProfile = bizRes.ok ? await bizRes.json() : EMPTY_PROFILE;
  const customFields = Object.fromEntries(
    await Promise.all(
      entityTypes.map(async (entityType, index) => [
        entityType,
        customFieldResponses[index]?.ok
          ? ((await customFieldResponses[index]!.json()) as CustomFieldDef[])
          : [],
      ]),
    ),
  ) as Record<(typeof entityTypes)[number], CustomFieldDef[]>;
  const configLists = Object.fromEntries(
    await Promise.all(
      configListKeys.map(async (listKey, index) => [
        listKey,
        configListResponses[index]?.ok
          ? ((await configListResponses[index]!.json()) as ConfigList)
          : { listKey, items: [], isDefault: true },
      ]),
    ),
  ) as Record<(typeof configListKeys)[number], ConfigList>;

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

      {/* Config-lists no-code (GEN-06/ENG-09/T-H126) */}
      <section className="flex flex-col gap-3" data-testid="config-lists-config">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold text-secondary">{t('configListsTitle')}</h2>
          <p className="text-xs text-secondary">{t('configListsHint')}</p>
        </div>
        <form
          action={createConfigListItemAction}
          data-testid="config-list-item-create"
          className="grid gap-3 rounded-xl border border-border bg-white p-4 shadow-sm md:grid-cols-6"
        >
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="text-xs font-medium text-secondary">{t('configListKey')}</span>
            <select name="listKey" className={inputCls} defaultValue="audit_opinion">
              {configListKeys.map((listKey) => (
                <option key={listKey} value={listKey}>
                  {t(`configListLabels.${listKey}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="text-xs font-medium text-secondary">{t('configListCode')}</span>
            <input
              name="code"
              required
              placeholder={t('configListCodePh')}
              aria-label={t('configListCode')}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="text-xs font-medium text-secondary">{t('configListLabelEn')}</span>
            <input name="labelEn" required placeholder="Qualified opinion" className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="text-xs font-medium text-secondary">{t('configListLabelAz')}</span>
            <input name="labelAz" placeholder="Şərtli rəy" className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="text-xs font-medium text-secondary">{t('configListLabelRu')}</span>
            <input name="labelRu" placeholder="Мнение с оговоркой" className={inputCls} />
          </label>
          <button type="submit" className={`${btnCls} md:col-span-2 md:self-end`}>
            {t('configListCreate')}
          </button>
        </form>
        <div className="grid gap-3 md:grid-cols-3" data-testid="config-lists-list">
          {configListKeys.map((listKey) => {
            const list = configLists[listKey];
            return (
              <article
                key={listKey}
                className="rounded-xl border border-border bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      {t(`configListLabels.${listKey}`)}
                    </h3>
                    <p className="mt-1 font-mono text-[11px] text-secondary">{listKey}</p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      list.isDefault ? 'bg-muted text-secondary' : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {list.isDefault ? t('configListDefault') : t('configListTenant')}
                  </span>
                </div>
                {list.items.length === 0 ? (
                  <p className="mt-3 text-xs text-secondary">{t('configListEmpty')}</p>
                ) : (
                  <ul className="mt-3 flex flex-col gap-2">
                    {list.items.map((item) => (
                      <li
                        key={item.code}
                        className="rounded-lg border border-border bg-muted/40 px-3 py-2"
                      >
                        <span className="font-mono text-xs font-semibold text-foreground">
                          {item.code}
                        </span>
                        <p className="mt-1 text-xs text-secondary">
                          {item.labelI18n?.en ?? item.code}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {/* Custom-fields no-code (GEN-07/T-H125) */}
      <section className="flex flex-col gap-3" data-testid="custom-fields-config">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold text-secondary">{t('customFieldsTitle')}</h2>
          <p className="text-xs text-secondary">{t('customFieldsHint')}</p>
        </div>
        <form
          action={createCustomFieldAction}
          data-testid="custom-field-create"
          className="grid gap-3 rounded-xl border border-border bg-white p-4 shadow-sm md:grid-cols-6"
        >
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="text-xs font-medium text-secondary">{t('customEntity')}</span>
            <select name="entityType" className={inputCls} defaultValue="risk">
              {entityTypes.map((entityType) => (
                <option key={entityType} value={entityType}>
                  {t(`customEntityTypes.${entityType}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="text-xs font-medium text-secondary">{t('customKey')}</span>
            <input
              name="key"
              required
              placeholder={t('customKeyPh')}
              aria-label={t('customKey')}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="text-xs font-medium text-secondary">{t('customType')}</span>
            <select name="fieldType" className={inputCls} defaultValue="text">
              {fieldTypes.map((fieldType) => (
                <option key={fieldType} value={fieldType}>
                  {t(`fieldTypes.${fieldType}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="text-xs font-medium text-secondary">{t('customLabelEn')}</span>
            <input name="labelEn" required placeholder="Evidence owner" className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="text-xs font-medium text-secondary">{t('customLabelAz')}</span>
            <input name="labelAz" placeholder="Sübut sahibi" className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="text-xs font-medium text-secondary">{t('customLabelRu')}</span>
            <input name="labelRu" placeholder="Владелец доказательства" className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-sm md:col-span-4">
            <span className="text-xs font-medium text-secondary">{t('customOptions')}</span>
            <input
              name="options"
              placeholder={t('customOptionsPh')}
              aria-label={t('customOptions')}
              className={inputCls}
            />
            <span className="text-[11px] text-secondary">{t('customOptionsHint')}</span>
          </label>
          <label className="flex items-center gap-2 text-sm md:col-span-2 md:self-end">
            <input
              type="checkbox"
              name="required"
              className="h-4 w-4 rounded border-border text-accent focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="text-xs font-medium text-secondary">{t('customRequired')}</span>
          </label>
          <button type="submit" className={`${btnCls} md:col-span-2 md:justify-self-start`}>
            {t('customCreate')}
          </button>
        </form>
        <div className="grid gap-3 md:grid-cols-2" data-testid="custom-fields-list">
          {entityTypes.map((entityType) => {
            const defs = customFields[entityType];
            return (
              <article
                key={entityType}
                className="rounded-xl border border-border bg-white p-4 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    {t(`customEntityTypes.${entityType}`)}
                  </h3>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-secondary">
                    {t('customCount', { count: defs.length })}
                  </span>
                </div>
                {defs.length === 0 ? (
                  <p className="mt-3 text-xs text-secondary">{t('customEmpty')}</p>
                ) : (
                  <ul className="mt-3 flex flex-col gap-2">
                    {defs.map((def) => (
                      <li
                        key={def.key}
                        className="rounded-lg border border-border bg-muted/40 px-3 py-2"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-foreground">
                            {def.key}
                          </span>
                          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-secondary">
                            {t(`fieldTypes.${def.fieldType}`)}
                          </span>
                          {def.required ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                              {t('customRequiredBadge')}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-secondary">
                          {def.labelI18n?.en ?? def.key}
                        </p>
                        {Array.isArray(def.options) && def.options.length > 0 ? (
                          <p className="mt-1 text-[11px] text-secondary">
                            {t('customOptionsList', { options: def.options.join(', ') })}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
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
