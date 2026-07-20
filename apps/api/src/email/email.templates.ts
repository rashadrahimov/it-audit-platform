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
