import { Inject, Injectable } from '@nestjs/common';
import type { Locale } from '@it-audit/shared';
import { EMAIL_PROVIDER, type EmailProvider } from './email.provider';
import { renderEmail, type EmailTemplateId } from './email.templates';

@Injectable()
export class EmailService {
  constructor(@Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider) {}

  async sendTemplate(
    templateId: EmailTemplateId,
    locale: Locale,
    to: string,
    vars: Record<string, string>,
  ): Promise<{ messageId: string; subject: string }> {
    const rendered = renderEmail(templateId, locale, vars);
    const { messageId } = await this.provider.send({ to, ...rendered });
    return { messageId, subject: rendered.subject };
  }
}
