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
