// Ждёт готовности docker-compose инфраструктуры: сервисы healthy, one-shot'ы — exited(0).
// Отдельный скрипт, потому что `docker compose up --wait` считает завершившийся
// minio-init провалом (poведение compose с one-shot контейнерами).
import { execSync } from 'node:child_process';

const TIMEOUT_MS = 90_000;
const deadline = Date.now() + TIMEOUT_MS;

const ready = (s) =>
  (s.State === 'running' && (s.Health === 'healthy' || s.Health === '')) ||
  (s.State === 'exited' && s.ExitCode === 0);

for (;;) {
  const services = execSync('docker compose ps -a --format json', { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const pending = services.filter((s) => !ready(s));
  if (services.length > 0 && pending.length === 0) {
    console.log(`Инфраструктура готова: ${services.map((s) => s.Service).join(', ')}`);
    process.exit(0);
  }
  if (Date.now() > deadline) {
    const stuck = pending.map((s) => `${s.Service} (${s.State}/${s.Health || '—'})`).join(', ');
    console.error(
      `Инфраструктура не поднялась за ${TIMEOUT_MS / 1000}с: ${stuck || 'нет сервисов'}`,
    );
    process.exit(1);
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
