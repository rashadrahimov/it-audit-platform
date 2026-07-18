/**
 * Абстракция провайдера коннектора (T-049, ADR-0011). Каждый провайдер объявляет
 * capabilities и умеет sync — вернуть записи домена (personnel/access/…) и метрики.
 * Провайдеры за интерфейсом: on-prem без интернета получает LDAP/локальные,
 * SaaS — облачные; отсутствие провайдера отключает авто-заполнение, не ломает платформу.
 */
export interface SyncResult {
  /** Записи, вытянутые из внешней системы (нормализованные). */
  records: Array<Record<string, unknown>>;
  /** Метрики прогона для sync_run.stats. */
  stats: Record<string, number>;
}

export interface ConnectorProvider {
  readonly provider: string;
  readonly capabilities: readonly string[];
  sync(config: Record<string, unknown>): Promise<SyncResult>;
}
