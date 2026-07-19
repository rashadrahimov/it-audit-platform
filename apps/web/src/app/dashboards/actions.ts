'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { apiFetch, getActiveTenantSlug } from '@/lib/session';

const CHART_TYPES = ['bar', 'pie', 'donut', 'number', 'line'];
const SLOTS = 4;

/** Виджеты из слотов конструктора: слот учитывается, если выбрана метрика. */
function widgetsFromForm(formData: FormData) {
  const widgets: Array<{ metric: string; chartType: string; title?: string }> = [];
  for (let i = 0; i < SLOTS; i++) {
    const metric = String(formData.get(`metric${i}`) ?? '').trim();
    if (!metric) continue;
    const chartType = String(formData.get(`chartType${i}`) ?? 'bar');
    const title = String(formData.get(`title${i}`) ?? '').trim();
    widgets.push({
      metric,
      chartType: CHART_TYPES.includes(chartType) ? chartType : 'bar',
      ...(title ? { title } : {}),
    });
  }
  return widgets;
}

/** Создать дашборд из конструктора (T-072 → UI T-V15). */
export async function createDashboardAction(formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const name = String(formData.get('name') ?? '').trim();
  const widgets = widgetsFromForm(formData);
  if (!name || widgets.length === 0) return;
  await apiFetch('/dashboards', {
    method: 'POST',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, widgets }),
  });
  revalidatePath('/dashboards');
}

/** Правка дашборда (T-V15): имя + полный набор виджетов из слотов. */
export async function updateDashboardAction(id: string, formData: FormData): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  const name = String(formData.get('name') ?? '').trim();
  const widgets = widgetsFromForm(formData);
  if (!name && widgets.length === 0) return;
  await apiFetch(`/dashboards/${id}`, {
    method: 'PATCH',
    headers: { 'X-Tenant-Slug': tenantSlug, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(name ? { name } : {}),
      ...(widgets.length > 0 ? { widgets } : {}),
    }),
  });
  revalidatePath(`/dashboards/${id}`);
  revalidatePath('/dashboards');
}

/** Удалить дашборд (T-V15, soft delete). */
export async function deleteDashboardAction(id: string): Promise<void> {
  const tenantSlug = await getActiveTenantSlug();
  if (!tenantSlug) return;
  await apiFetch(`/dashboards/${id}`, {
    method: 'DELETE',
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  revalidatePath('/dashboards');
  redirect('/dashboards');
}
