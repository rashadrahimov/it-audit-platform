/** Единственная системная очередь; доменные очереди появятся по мере фич (T-041 email и далее). */
export const SYSTEM_QUEUE = 'system';

export const JOB_DEMO_DELAYED = 'demo-delayed';
export const JOB_HEARTBEAT = 'heartbeat';

/** Redis-ключ с временем последнего heartbeat-прогона планировщика. */
export const HEARTBEAT_KEY = 'jobs:heartbeat:last-run';

/** Интервал heartbeat: первый прогон сразу, дальше раз в минуту. */
export const HEARTBEAT_EVERY_MS = 60_000;
