import { resolveLocalized, type Locale } from '@it-audit/shared';

/**
 * Мультиязычные шаблоны писем (ADR-0009): контент на EN/AZ/RU, fallback на EN.
 * Пока шаблоны — код; конфигурируемые per-tenant шаблоны появятся с доменом.
 */
interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

type TemplateVars = Record<string, string>;
type TemplateRenderer = (vars: TemplateVars) => RenderedEmail;
type LocalizedTemplate = Partial<Record<Locale, TemplateRenderer>> & { en: TemplateRenderer };

const wrap = (body: string): string =>
  `<div style="font-family:sans-serif;max-width:600px">${body}</div>`;

export const emailTemplates = {
  invite: {
    en: ({ inviteUrl, tenantName }) => ({
      subject: `You are invited to IT Audit Platform (${tenantName})`,
      html: wrap(
        `<p>You have been invited to join <b>${tenantName}</b> on IT Audit Platform.</p><p><a href="${inviteUrl}">Accept the invitation</a> (link is valid for 7 days).</p>`,
      ),
      text: `You have been invited to join ${tenantName} on IT Audit Platform. Accept: ${inviteUrl} (valid 7 days)`,
    }),
    az: ({ inviteUrl, tenantName }) => ({
      subject: `IT Audit Platform-a dəvət (${tenantName})`,
      html: wrap(
        `<p><b>${tenantName}</b> qrupuna IT Audit Platform-da qoşulmağa dəvət olunmusunuz.</p><p><a href="${inviteUrl}">Dəvəti qəbul edin</a> (keçid 7 gün etibarlıdır).</p>`,
      ),
      text: `${tenantName} qrupuna dəvət olunmusunuz. Qəbul: ${inviteUrl} (7 gün etibarlıdır)`,
    }),
    ru: ({ inviteUrl, tenantName }) => ({
      subject: `Приглашение в IT Audit Platform (${tenantName})`,
      html: wrap(
        `<p>Вас пригласили присоединиться к <b>${tenantName}</b> в IT Audit Platform.</p><p><a href="${inviteUrl}">Принять приглашение</a> (ссылка действует 7 дней).</p>`,
      ),
      text: `Вас пригласили в ${tenantName}. Принять: ${inviteUrl} (действует 7 дней)`,
    }),
  },
  'magic-link': {
    en: ({ magicUrl, minutes }) => ({
      subject: 'Your STATERA sign-in link',
      html: wrap(
        `<p>Use this link to sign in to STATERA — no password needed.</p><p><a href="${magicUrl}">Sign in</a> (link is valid for ${minutes} minutes and can be used once).</p><p style="color:#64748b;font-size:13px">If you didn't request this, you can safely ignore this email.</p>`,
      ),
      text: `Use this link to sign in to STATERA (no password needed): ${magicUrl} — valid for ${minutes} minutes, single use. If you didn't request this, ignore this email.`,
    }),
    az: ({ magicUrl, minutes }) => ({
      subject: 'STATERA-ya giriş keçidiniz',
      html: wrap(
        `<p>Şifrəsiz STATERA-ya daxil olmaq üçün bu keçiddən istifadə edin.</p><p><a href="${magicUrl}">Daxil ol</a> (keçid ${minutes} dəqiqə etibarlıdır və bir dəfə istifadə olunur).</p><p style="color:#64748b;font-size:13px">Bunu siz istəməmisinizsə, bu məktubu nəzərə almaya bilərsiniz.</p>`,
      ),
      text: `Şifrəsiz STATERA-ya daxil olmaq üçün keçid: ${magicUrl} — ${minutes} dəqiqə etibarlıdır, bir dəfəlik. Bunu siz istəməmisinizsə, məktubu nəzərə almayın.`,
    }),
    ru: ({ magicUrl, minutes }) => ({
      subject: 'Ссылка для входа в STATERA',
      html: wrap(
        `<p>Войдите в STATERA по этой ссылке — пароль не нужен.</p><p><a href="${magicUrl}">Войти</a> (ссылка действует ${minutes} минут и одноразовая).</p><p style="color:#64748b;font-size:13px">Если вы не запрашивали вход, просто проигнорируйте это письмо.</p>`,
      ),
      text: `Войдите в STATERA по ссылке (пароль не нужен): ${magicUrl} — действует ${minutes} минут, одноразовая. Если вы не запрашивали вход, проигнорируйте письмо.`,
    }),
  },
  'finding-assigned': {
    en: ({ findingTitle, dueDate }) => ({
      subject: `Finding assigned to you: ${findingTitle}`,
      html: wrap(
        `<p>A finding has been assigned to you: <b>${findingTitle}</b>.</p><p>Deadline: ${dueDate || 'not set'}.</p>`,
      ),
      text: `A finding has been assigned to you: ${findingTitle}. Deadline: ${dueDate || 'not set'}.`,
    }),
    az: ({ findingTitle, dueDate }) => ({
      subject: `Sizə finding təyin edildi: ${findingTitle}`,
      html: wrap(
        `<p>Sizə finding təyin edildi: <b>${findingTitle}</b>.</p><p>Son tarix: ${dueDate || 'təyin edilməyib'}.</p>`,
      ),
      text: `Sizə finding təyin edildi: ${findingTitle}. Son tarix: ${dueDate || 'təyin edilməyib'}.`,
    }),
    ru: ({ findingTitle, dueDate }) => ({
      subject: `Вам назначен finding: ${findingTitle}`,
      html: wrap(
        `<p>Вам назначен finding: <b>${findingTitle}</b>.</p><p>Дедлайн: ${dueDate || 'не задан'}.</p>`,
      ),
      text: `Вам назначен finding: ${findingTitle}. Дедлайн: ${dueDate || 'не задан'}.`,
    }),
  },
  'finding-reminder': {
    en: ({ findingTitle, dueDate }) => ({
      subject: `Deadline approaching: ${findingTitle}`,
      html: wrap(
        `<p>The deadline for finding <b>${findingTitle}</b> is approaching: ${dueDate}.</p>`,
      ),
      text: `The deadline for finding ${findingTitle} is approaching: ${dueDate}.`,
    }),
    az: ({ findingTitle, dueDate }) => ({
      subject: `Son tarix yaxınlaşır: ${findingTitle}`,
      html: wrap(`<p><b>${findingTitle}</b> finding-i üçün son tarix yaxınlaşır: ${dueDate}.</p>`),
      text: `${findingTitle} üçün son tarix yaxınlaşır: ${dueDate}.`,
    }),
    ru: ({ findingTitle, dueDate }) => ({
      subject: `Приближается дедлайн: ${findingTitle}`,
      html: wrap(`<p>Приближается дедлайн по finding <b>${findingTitle}</b>: ${dueDate}.</p>`),
      text: `Приближается дедлайн по finding ${findingTitle}: ${dueDate}.`,
    }),
  },
  'test-failing': {
    en: ({ testTitle }) => ({
      subject: `Test failing: ${testTitle}`,
      html: wrap(`<p>The test <b>${testTitle}</b> you own is failing. Please review it.</p>`),
      text: `The test ${testTitle} is failing.`,
    }),
    az: ({ testTitle }) => ({
      subject: `Test uğursuzdur: ${testTitle}`,
      html: wrap(`<p>Sahibi olduğunuz <b>${testTitle}</b> testi uğursuzdur. Nəzərdən keçirin.</p>`),
      text: `${testTitle} testi uğursuzdur.`,
    }),
    ru: ({ testTitle }) => ({
      subject: `Тест провален: ${testTitle}`,
      html: wrap(`<p>Ваш тест <b>${testTitle}</b> провален. Посмотрите, что случилось.</p>`),
      text: `Тест ${testTitle} провален.`,
    }),
  },
  'policy-review-request': {
    en: ({ policyTitle }) => ({
      subject: `Approval requested: ${policyTitle}`,
      html: wrap(`<p>The policy <b>${policyTitle}</b> awaits your approval.</p>`),
      text: `The policy ${policyTitle} awaits your approval.`,
    }),
    az: ({ policyTitle }) => ({
      subject: `Təsdiq tələb olunur: ${policyTitle}`,
      html: wrap(`<p><b>${policyTitle}</b> siyasəti təsdiqinizi gözləyir.</p>`),
      text: `${policyTitle} siyasəti təsdiqinizi gözləyir.`,
    }),
    ru: ({ policyTitle }) => ({
      subject: `Требуется согласование: ${policyTitle}`,
      html: wrap(`<p>Политика <b>${policyTitle}</b> ждёт вашего решения.</p>`),
      text: `Политика ${policyTitle} ждёт вашего решения.`,
    }),
  },
  'policy-renewal': {
    en: ({ policyTitle, renewBy }) => ({
      subject: `Policy renewal due: ${policyTitle}`,
      html: wrap(
        `<p>The policy <b>${policyTitle}</b> is due for renewal by ${renewBy}. Please review and update it.</p>`,
      ),
      text: `The policy ${policyTitle} is due for renewal by ${renewBy}.`,
    }),
    az: ({ policyTitle, renewBy }) => ({
      subject: `Siyasətin yenilənmə vaxtıdır: ${policyTitle}`,
      html: wrap(
        `<p><b>${policyTitle}</b> siyasətinin yenilənmə tarixi: ${renewBy}. Zəhmət olmasa nəzərdən keçirin.</p>`,
      ),
      text: `${policyTitle} siyasətinin yenilənmə tarixi: ${renewBy}.`,
    }),
    ru: ({ policyTitle, renewBy }) => ({
      subject: `Пора продлить политику: ${policyTitle}`,
      html: wrap(
        `<p>Политике <b>${policyTitle}</b> требуется продление к ${renewBy}. Пожалуйста, пересмотрите её.</p>`,
      ),
      text: `Политике ${policyTitle} требуется продление к ${renewBy}.`,
    }),
  },
  'policy-attestation': {
    en: ({ policyTitle }) => ({
      subject: `Please attest: ${policyTitle}`,
      html: wrap(
        `<p>Please review and attest that you have read the policy <b>${policyTitle}</b>.</p>`,
      ),
      text: `Please review and attest the policy: ${policyTitle}.`,
    }),
    az: ({ policyTitle }) => ({
      subject: `Təsdiq tələb olunur: ${policyTitle}`,
      html: wrap(`<p>Zəhmət olmasa <b>${policyTitle}</b> siyasətini oxuyub təsdiq edin.</p>`),
      text: `Zəhmət olmasa siyasəti təsdiq edin: ${policyTitle}.`,
    }),
    ru: ({ policyTitle }) => ({
      subject: `Требуется подтверждение: ${policyTitle}`,
      html: wrap(
        `<p>Пожалуйста, ознакомьтесь и подтвердите прочтение политики <b>${policyTitle}</b>.</p>`,
      ),
      text: `Пожалуйста, подтвердите ознакомление с политикой: ${policyTitle}.`,
    }),
  },
  'weekly-digest': {
    en: ({
      tenantName,
      openFindings,
      overdueFindings,
      overdueTasks,
      policiesDue,
      reportPackageTitle,
      reportPackageReadiness,
      reportPackageStatus,
      reportPackageFiles,
      reportPackageFormats,
      reportPackagePath,
    }) => ({
      subject: `Weekly compliance digest — ${tenantName}`,
      html: wrap(
        `<p>Your weekly compliance digest for <b>${tenantName}</b>:</p>` +
          `<ul><li>Open findings: <b>${openFindings}</b> (${overdueFindings} overdue)</li>` +
          `<li>Overdue tasks: <b>${overdueTasks}</b></li>` +
          `<li>Policies due for renewal: <b>${policiesDue}</b></li>` +
          `<li>Report package: <b>${reportPackageTitle}</b> — ${reportPackageReadiness}% (${reportPackageStatus}), ${reportPackageFiles} files: ${reportPackageFormats}</li></ul>` +
          `<p>Package path: <code>${reportPackagePath}</code></p>` +
          `<p>Sign in to review and act on outstanding items.</p>`,
      ),
      text: `Weekly digest for ${tenantName}: open findings ${openFindings} (${overdueFindings} overdue), overdue tasks ${overdueTasks}, policies due ${policiesDue}. Report package ${reportPackageTitle}: ${reportPackageReadiness}% (${reportPackageStatus}), ${reportPackageFiles} files (${reportPackageFormats}), ${reportPackagePath}.`,
    }),
    az: ({
      tenantName,
      openFindings,
      overdueFindings,
      overdueTasks,
      policiesDue,
      reportPackageTitle,
      reportPackageReadiness,
      reportPackageStatus,
      reportPackageFiles,
      reportPackageFormats,
      reportPackagePath,
    }) => ({
      subject: `Həftəlik uyğunluq icmalı — ${tenantName}`,
      html: wrap(
        `<p><b>${tenantName}</b> üçün həftəlik icmal:</p>` +
          `<ul><li>Açıq findinqlər: <b>${openFindings}</b> (${overdueFindings} gecikmiş)</li>` +
          `<li>Gecikmiş tapşırıqlar: <b>${overdueTasks}</b></li>` +
          `<li>Yenilənməli siyasətlər: <b>${policiesDue}</b></li>` +
          `<li>Hesabat paketi: <b>${reportPackageTitle}</b> — ${reportPackageReadiness}% (${reportPackageStatus}), ${reportPackageFiles} fayl: ${reportPackageFormats}</li></ul>` +
          `<p>Paket yolu: <code>${reportPackagePath}</code></p>`,
      ),
      text: `Həftəlik icmal ${tenantName}: açıq findinqlər ${openFindings} (${overdueFindings} gecikmiş), gecikmiş tapşırıqlar ${overdueTasks}, siyasətlər ${policiesDue}. Hesabat paketi ${reportPackageTitle}: ${reportPackageReadiness}% (${reportPackageStatus}), ${reportPackageFiles} fayl (${reportPackageFormats}), ${reportPackagePath}.`,
    }),
    ru: ({
      tenantName,
      openFindings,
      overdueFindings,
      overdueTasks,
      policiesDue,
      reportPackageTitle,
      reportPackageReadiness,
      reportPackageStatus,
      reportPackageFiles,
      reportPackageFormats,
      reportPackagePath,
    }) => ({
      subject: `Еженедельный дайджест комплаенса — ${tenantName}`,
      html: wrap(
        `<p>Ваш еженедельный дайджест по <b>${tenantName}</b>:</p>` +
          `<ul><li>Открытых findings: <b>${openFindings}</b> (${overdueFindings} просрочено)</li>` +
          `<li>Просроченных задач: <b>${overdueTasks}</b></li>` +
          `<li>Политик к продлению: <b>${policiesDue}</b></li>` +
          `<li>Пакет отчётов: <b>${reportPackageTitle}</b> — ${reportPackageReadiness}% (${reportPackageStatus}), ${reportPackageFiles} файлов: ${reportPackageFormats}</li></ul>` +
          `<p>Путь пакета: <code>${reportPackagePath}</code></p>` +
          `<p>Войдите, чтобы разобрать открытые пункты.</p>`,
      ),
      text: `Дайджест ${tenantName}: открытых findings ${openFindings} (${overdueFindings} просрочено), просроченных задач ${overdueTasks}, политик ${policiesDue}. Пакет отчётов ${reportPackageTitle}: ${reportPackageReadiness}% (${reportPackageStatus}), ${reportPackageFiles} файлов (${reportPackageFormats}), ${reportPackagePath}.`,
    }),
  },
  'document-overdue': {
    en: ({ filename, renewBy }) => ({
      subject: `Evidence overdue: ${filename}`,
      html: wrap(
        `<p>The document <b>${filename}</b> is overdue for renewal${renewBy ? ` (due ${renewBy})` : ''}. Please upload a fresh version to keep your evidence current.</p>`,
      ),
      text: `The document ${filename} is overdue for renewal${renewBy ? ` (due ${renewBy})` : ''}. Please upload a fresh version.`,
    }),
    az: ({ filename, renewBy }) => ({
      subject: `Sübut gecikib: ${filename}`,
      html: wrap(
        `<p><b>${filename}</b> sənədinin yenilənmə vaxtı keçib${renewBy ? ` (son tarix ${renewBy})` : ''}. Zəhmət olmasa yeni versiya yükləyin.</p>`,
      ),
      text: `${filename} sənədinin yenilənmə vaxtı keçib${renewBy ? ` (son tarix ${renewBy})` : ''}. Yeni versiya yükləyin.`,
    }),
    ru: ({ filename, renewBy }) => ({
      subject: `Доказательство просрочено: ${filename}`,
      html: wrap(
        `<p>Документ <b>${filename}</b> просрочен по сроку обновления${renewBy ? ` (до ${renewBy})` : ''}. Пожалуйста, загрузите свежую версию, чтобы поддерживать доказательства актуальными.</p>`,
      ),
      text: `Документ ${filename} просрочен по сроку обновления${renewBy ? ` (до ${renewBy})` : ''}. Загрузите свежую версию.`,
    }),
  },
  'test-email': {
    en: ({ sentAt }) => ({
      subject: 'Test email — IT Audit Platform',
      html: wrap(`<p>This is a test email from IT Audit Platform.</p><p>Sent at: ${sentAt}</p>`),
      text: `This is a test email from IT Audit Platform. Sent at: ${sentAt}`,
    }),
    az: ({ sentAt }) => ({
      subject: 'Test məktubu — IT Audit Platform',
      html: wrap(`<p>Bu, IT Audit Platform-dan test məktubudur.</p><p>Göndərilib: ${sentAt}</p>`),
      text: `Bu, IT Audit Platform-dan test məktubudur. Göndərilib: ${sentAt}`,
    }),
    ru: ({ sentAt }) => ({
      subject: 'Тестовое письмо — IT Audit Platform',
      html: wrap(`<p>Это тестовое письмо от IT Audit Platform.</p><p>Отправлено: ${sentAt}</p>`),
      text: `Это тестовое письмо от IT Audit Platform. Отправлено: ${sentAt}`,
    }),
  },
} satisfies Record<string, LocalizedTemplate>;

export type EmailTemplateId = keyof typeof emailTemplates;

export function renderEmail(
  templateId: EmailTemplateId,
  locale: Locale,
  vars: TemplateVars,
): RenderedEmail {
  return resolveLocalized(emailTemplates[templateId], locale)(vars);
}
