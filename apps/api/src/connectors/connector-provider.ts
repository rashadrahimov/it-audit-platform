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

/**
 * T-V38: описание одного поля конфига провайдера для каталога — веб рисует форму
 * по этим полям вместо сырого JSON. `secret` — маскировать в UI и не отдавать значение.
 */
export interface ConfigField {
  key: string;
  label: string;
  type: 'text' | 'url' | 'password' | 'json';
  required: boolean;
  placeholder?: string;
  secret?: boolean;
}

/** T-V38: результат проверки соединения — структурный, никогда не роняет запрос. */
export interface TestConnectionResult {
  ok: boolean;
  message: string;
}

export interface ConnectorProvider {
  readonly provider: string;
  readonly capabilities: readonly string[];
  /** T-V38: человекочитаемое имя для каталога. */
  readonly label: string;
  /** T-V38: короткое описание, что коннектор делает (для каталога). */
  readonly description: string;
  /** T-V38: поля конфига — веб строит по ним форму создания/редактирования. */
  readonly configFields: readonly ConfigField[];
  sync(config: Record<string, unknown>): Promise<SyncResult>;
  /**
   * T-V38: лёгкая проверка соединения без записи sync_run и без побочных эффектов.
   * Провайдер обязан не бросать на сетевых/кред-ошибках, а вернуть {ok:false, message}.
   */
  testConnection(config: Record<string, unknown>): Promise<TestConnectionResult>;
}
