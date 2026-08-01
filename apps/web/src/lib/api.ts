import { healthResponseSchema, type HealthResponse } from '@it-audit/shared';
import { apiRequest } from '@/lib/api-request';

/** Запрашивает /health у API; null — если API недоступен или ответ не по контракту. */
export async function fetchApiHealth(): Promise<HealthResponse | null> {
  try {
    const res = await apiRequest('/health');
    if (!res.ok) return null;
    const parsed = healthResponseSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
