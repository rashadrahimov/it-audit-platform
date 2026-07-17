import type { Locale } from '@it-audit/shared';

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

/** Fallback на EN, если перевода нет (ADR-0009). Экспорт — ради тестируемости механизма. */
export function resolveLocalized<T>(
  localized: Partial<Record<Locale, T>> & { en: T },
  locale: Locale,
): T {
  return localized[locale] ?? localized.en;
}

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
