import { fetchApiHealth, formatHealthLabel } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const health = await fetchApiHealth();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold">IT Audit Platform</h1>
      <p className="text-neutral-500">Скелет монорепо (T-005). Функционал появится в M0/M1.</p>
      <p data-testid="api-status" className={health ? 'text-green-700' : 'text-red-700'}>
        {formatHealthLabel(health)}
      </p>
    </main>
  );
}
