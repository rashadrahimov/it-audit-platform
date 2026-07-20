'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  createConnectorAction,
  deleteConnectorAction,
  syncConnectorAction,
  testConnectorAction,
  updateConnectorAction,
} from './actions';

export interface ConfigField {
  key: string;
  label: string;
  type: 'text' | 'url' | 'password' | 'json';
  required: boolean;
  placeholder?: string;
  secret?: boolean;
}
export interface CatalogEntry {
  provider: string;
  label: string;
  description: string;
  capabilities: string[];
  configFields: ConfigField[];
}
export interface Connector {
  id: string;
  provider: string;
  capabilities: string[];
  status: string;
  hasConfig: boolean;
  syncIntervalMinutes: number | null;
  lastSyncText: string;
}

const inputCls =
  'rounded-md border border-border px-3 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
const btnCls =
  'cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-primary transition-colors duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';
const ghostBtnCls =
  'cursor-pointer rounded-md border border-border bg-white px-4 py-2 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring';

/** Одно поле конфига (input/url/password/textarea для json). */
function ConfigInput({ field, defaultValue }: { field: ConfigField; defaultValue?: string }) {
  const common = {
    name: `cfg_${field.key}`,
    required: field.required && defaultValue === undefined,
    placeholder: field.placeholder,
    defaultValue,
  };
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium text-secondary">
        {field.label}
        {field.required ? ' *' : ''}
      </span>
      {field.type === 'json' ? (
        <textarea {...common} rows={3} className={`${inputCls} font-mono text-xs`} />
      ) : (
        <input
          {...common}
          type={field.type === 'password' ? 'password' : field.type === 'url' ? 'url' : 'text'}
          className={inputCls}
        />
      )}
    </label>
  );
}

/** T-V38: добавить коннектор из каталога — выбор провайдера рисует форму его полей. */
export function AddConnector({ catalog }: { catalog: CatalogEntry[] }) {
  const t = useTranslations('connectors');
  const [provider, setProvider] = useState('');
  const entry = catalog.find((c) => c.provider === provider);

  return (
    <section className="flex flex-col gap-3" data-testid="connector-add">
      <h2 className="text-sm font-semibold text-secondary">{t('addTitle')}</h2>
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-white p-4 shadow-sm">
        <label className="flex max-w-md flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-secondary">{t('provider')}</span>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            data-testid="connector-provider-select"
            className={inputCls}
          >
            <option value="">{t('pickProvider')}</option>
            {catalog.map((c) => (
              <option key={c.provider} value={c.provider}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        {entry && (
          <form
            action={createConnectorAction}
            data-testid="connector-create-form"
            className="flex flex-col gap-4 border-t border-border pt-4"
          >
            <input type="hidden" name="provider" value={entry.provider} />
            <p className="text-xs text-secondary">{entry.description}</p>

            <fieldset className="flex flex-wrap gap-3">
              <legend className="mb-1 text-xs font-medium text-secondary">
                {t('capabilities')}
              </legend>
              {entry.capabilities.map((cap) => (
                <label key={cap} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" name="capabilities" value={cap} defaultChecked />
                  <span className="text-foreground">{cap}</span>
                </label>
              ))}
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-2">
              {entry.configFields.map((f) => (
                <div key={f.key} className={f.type === 'json' ? 'sm:col-span-2' : ''}>
                  <ConfigInput field={f} />
                </div>
              ))}
            </div>

            <button
              type="submit"
              data-testid="connector-create-submit"
              className={`${btnCls} self-start`}
            >
              {t('create')}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

/** Кнопка «Тест соединения» с inline-фидбеком (useActionState). */
function TestButton({ id }: { id: string }) {
  const t = useTranslations('connectors');
  const [state, formAction, pending] = useActionState(testConnectorAction, null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={formAction}>
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          disabled={pending}
          data-testid={`test-${id}`}
          className={`${ghostBtnCls} disabled:opacity-60`}
        >
          {pending ? t('testing') : t('test')}
        </button>
      </form>
      {state && (
        <span
          data-testid={`test-result-${id}`}
          className={
            'rounded-full px-2.5 py-0.5 text-xs font-medium ' +
            (state.ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800')
          }
        >
          {state.ok ? '✓ ' : '✕ '}
          {state.message}
        </span>
      )}
    </div>
  );
}

/** Карточка коннектора: статус, capabilities, расписание + действия. */
export function ConnectorCard({
  connector,
  entry,
}: {
  connector: Connector;
  entry?: CatalogEntry;
}) {
  const t = useTranslations('connectors');
  const [editing, setEditing] = useState(false);
  const caps = entry?.capabilities ?? connector.capabilities;

  return (
    <div
      className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-sm"
      data-testid={`connector-${connector.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">
              {entry?.label ?? connector.provider.toUpperCase()}
            </span>
            <span
              className={
                'rounded-full px-2.5 py-0.5 text-xs font-medium ' +
                (connector.status === 'active'
                  ? 'bg-green-100 text-green-800'
                  : connector.status === 'error'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-muted text-secondary')
              }
            >
              {t(`statuses.${connector.status}`)}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {connector.capabilities.map((cap) => (
              <span key={cap} className="rounded-full bg-muted px-2 py-0.5 text-xs text-secondary">
                {cap}
              </span>
            ))}
          </div>
          <span className="text-xs text-secondary">
            {t('schedule')}:{' '}
            {connector.syncIntervalMinutes
              ? t('everyMin', { n: connector.syncIntervalMinutes })
              : t('manual')}{' '}
            · {t('lastSync')}: {connector.lastSyncText}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <form action={syncConnectorAction.bind(null, connector.id)}>
            <button type="submit" data-testid={`sync-${connector.id}`} className={btnCls}>
              {t('sync')}
            </button>
          </form>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            data-testid={`edit-${connector.id}`}
            className={ghostBtnCls}
          >
            {editing ? t('close') : t('edit')}
          </button>
          <form
            action={deleteConnectorAction}
            onSubmit={(e) => {
              if (!confirm(t('deleteConfirm'))) e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={connector.id} />
            <button
              type="submit"
              data-testid={`delete-${connector.id}`}
              className="cursor-pointer rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('delete')}
            </button>
          </form>
        </div>
      </div>

      <TestButton id={connector.id} />

      {editing && (
        <form
          action={updateConnectorAction}
          data-testid={`edit-form-${connector.id}`}
          className="flex flex-col gap-4 border-t border-border pt-4"
        >
          <input type="hidden" name="id" value={connector.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium text-secondary">{t('status')}</span>
              <select
                name="status"
                defaultValue={connector.status === 'disabled' ? 'disabled' : 'active'}
                className={inputCls}
              >
                <option value="active">{t('statuses.active')}</option>
                <option value="disabled">{t('statuses.disabled')}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium text-secondary">{t('intervalMin')}</span>
              <input
                name="syncIntervalMinutes"
                type="number"
                min={0}
                max={44640}
                defaultValue={connector.syncIntervalMinutes ?? 0}
                data-testid={`interval-${connector.id}`}
                className={inputCls}
              />
              <span className="text-[11px] text-secondary">{t('intervalHint')}</span>
            </label>
          </div>

          <fieldset className="flex flex-wrap gap-3">
            <legend className="mb-1 text-xs font-medium text-secondary">{t('capabilities')}</legend>
            {caps.map((cap) => (
              <label key={cap} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  name="capabilities"
                  value={cap}
                  defaultChecked={connector.capabilities.includes(cap)}
                />
                <span className="text-foreground">{cap}</span>
              </label>
            ))}
          </fieldset>

          {entry && entry.configFields.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-secondary">{t('configEdit')}</span>
              <div className="grid gap-3 sm:grid-cols-2">
                {entry.configFields.map((f) => (
                  <div key={f.key} className={f.type === 'json' ? 'sm:col-span-2' : ''}>
                    <ConfigInput field={{ ...f, required: false }} defaultValue="" />
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            type="submit"
            data-testid={`save-${connector.id}`}
            className={`${btnCls} self-start`}
          >
            {t('save')}
          </button>
        </form>
      )}
    </div>
  );
}
