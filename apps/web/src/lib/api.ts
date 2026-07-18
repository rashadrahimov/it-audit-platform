import { healthResponseSchema, type HealthResponse } from '@it-audit/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

/** Запрашивает /health у API; null — если API недоступен или ответ не по контракту. */
export async function fetchApiHealth(): Promise<HealthResponse | null> {
  try {
    const res = await fetch(`${API_URL}/health`, { cache: 'no-store' });
    if (!res.ok) return null;
    const parsed = healthResponseSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
