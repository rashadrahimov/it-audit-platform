/** Единственная системная очередь; доменные очереди появятся по мере фич (T-041 email и далее). */
export const SYSTEM_QUEUE = 'system';

export const JOB_DEMO_DELAYED = 'demo-delayed';
export const JOB_HEARTBEAT = 'heartbeat';
export const JOB_DEACTIVATE_INACTIVE = 'deactivate-inactive-users';

/** Авто-деактивация (T-017): раз в сутки. */
export const DEACTIVATE_INACTIVE_EVERY_MS = 24 * 60 * 60 * 1000;

/** Redis-ключ с временем последнего heartbeat-прогона планировщика. */
export const HEARTBEAT_KEY = 'jobs:heartbeat:last-run';

/** Интервал heartbeat: первый прогон сразу, дальше раз в минуту. */
export const HEARTBEAT_EVERY_MS = 60_000;

export const JOB_SLA_RECALC = 'sla-recalc';

/** SLA-пересчёт (T-043): первый прогон при старте, дальше раз в час. */
export const SLA_RECALC_EVERY_MS = 60 * 60 * 1000;

export const JOB_FINDING_REMINDERS = 'finding-reminders';

/** Напоминания о дедлайнах findings (T-039): раз в сутки. */
export const FINDING_REMINDERS_EVERY_MS = 24 * 60 * 60 * 1000;

export const JOB_POLICY_RENEWAL_REMINDERS = 'policy-renewal-reminders';

/** Напоминания о продлении политик (T-V04): раз в сутки. */
export const POLICY_RENEWAL_REMINDERS_EVERY_MS = 24 * 60 * 60 * 1000;

export const JOB_AUTO_TEST_RUN = 'auto-test-run';

/** Автотесты через коннекторы (T-050, continuous compliance): раз в час. */
export const AUTO_TEST_RUN_EVERY_MS = 60 * 60 * 1000;

export const JOB_NOTIFICATION_EMAIL = 'notification-email';
