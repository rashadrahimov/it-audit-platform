import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/lib/session';
import { MfaSection } from './mfa-section';

export const dynamic = 'force-dynamic';

/** T-V52: личная безопасность — self-service двухфакторная аутентификация (MFA). */
export default async function SecurityPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const t = await getTranslations('security');

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6 pt-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-primary">{t('title')}</h1>
      </div>
      <p className="text-sm text-secondary">{t('intro')}</p>

      <section className="flex flex-col gap-3" data-testid="mfa">
        <h2 className="text-sm font-semibold text-secondary">{t('mfaTitle')}</h2>
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <MfaSection enabled={user.mfaEnabled} />
        </div>
      </section>
    </main>
  );
}
