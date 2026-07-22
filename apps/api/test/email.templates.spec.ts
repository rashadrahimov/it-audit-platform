import { describe, expect, it } from 'vitest';
import { renderEmail } from '../src/email/email.templates';
import { weeklyDigestReportPackageVars } from '../src/jobs/weekly-digest.service';

describe('renderEmail', () => {
  it('рендерит шаблон на запрошенном языке с подстановкой', () => {
    const email = renderEmail('test-email', 'ru', { sentAt: '2026-07-17T00:00:00.000Z' });
    expect(email.subject).toContain('Тестовое письмо');
    expect(email.text).toContain('2026-07-17T00:00:00.000Z');
  });

  it('рендерит все языки продукта', () => {
    expect(renderEmail('test-email', 'en', { sentAt: 'x' }).subject).toContain('Test email');
    expect(renderEmail('test-email', 'az', { sentAt: 'x' }).subject).toContain('Test məktubu');
  });

  it('magic-link: содержит ссылку и срок жизни на всех языках', () => {
    const vars = { magicUrl: 'http://localhost:3000/login/magic?token=abc', minutes: '15' };
    for (const locale of ['en', 'az', 'ru'] as const) {
      const email = renderEmail('magic-link', locale, vars);
      expect(email.html).toContain(vars.magicUrl);
      expect(email.text).toContain(vars.magicUrl);
      expect(email.text).toContain('15');
    }
    expect(renderEmail('magic-link', 'ru', vars).subject).toContain('вход');
  });

  it('weekly-digest includes the standard report package snapshot in every locale', () => {
    const base = {
      tenantName: 'Demo Group',
      openFindings: '4',
      overdueFindings: '1',
      overdueTasks: '2',
      policiesDue: '3',
      reportPackageTitle: 'Access audit',
      reportPackageReadiness: '83',
      reportPackageStatus: 'ready',
      reportPackageFiles: '15',
      reportPackageFormats: 'PDF / Word / Excel',
      reportPackagePath: '/engagements/e1/report/package?locale=en',
    };

    for (const locale of ['en', 'az', 'ru'] as const) {
      const email = renderEmail('weekly-digest', locale, base);
      expect(email.text).toContain('Access audit');
      expect(email.text).toContain('83%');
      expect(email.text).toContain('15');
      expect(email.text).toContain('/engagements/e1/report/package?locale=en');
    }
    expect(renderEmail('weekly-digest', 'ru', base).html).toContain('Пакет отчётов');
  });

  it('weekly digest report package vars localize title, status and package path', () => {
    const vars = weeklyDigestReportPackageVars(
      {
        engagementId: '019f882d-0c3f-7554-9e36-b6cba9fb56dc',
        titleI18n: { en: 'Access audit', ru: 'Аудит доступа', az: 'Giriş auditi' },
        readinessScore: 67,
        ready: false,
        checklistTotal: 3,
        answered: 2,
        findings: 1,
        openFindings: 1,
        risks: 1,
        evidenceLinks: 0,
        totalFiles: 15,
        formats: ['PDF', 'Word', 'Excel'],
      },
      'ru',
    );

    expect(vars).toMatchObject({
      reportPackageTitle: 'Аудит доступа',
      reportPackageReadiness: '67',
      reportPackageStatus: 'сначала проверить',
      reportPackageFiles: '15',
      reportPackageFormats: 'PDF / Word / Excel',
      reportPackagePath:
        '/engagements/019f882d-0c3f-7554-9e36-b6cba9fb56dc/report/package?locale=ru',
    });
  });
});

// resolveLocalized переехал в shared (T-022) — тесты в packages/shared/src/i18n.test.ts
