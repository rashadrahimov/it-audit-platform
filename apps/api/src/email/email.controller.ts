import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation } from '@nestjs/swagger';
import { DEFAULT_LOCALE, emailDemoRequestSchema, type EmailDemoResponse } from '@it-audit/shared';
import { EmailService } from './email.service';

const DEMO_RECIPIENT = 'demo@it-audit.localhost';

@Controller('email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Post('demo')
  @ApiOperation({ summary: 'Отправить тестовое письмо в Mailpit (DoD T-041)' })
  @ApiCreatedResponse({ description: 'Письмо отправлено через провайдер-абстракцию' })
  async sendDemo(@Body() body: unknown): Promise<EmailDemoResponse> {
    const parsed = emailDemoRequestSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const to = parsed.data.to ?? DEMO_RECIPIENT;
    const locale = parsed.data.locale ?? DEFAULT_LOCALE;
    const { messageId, subject } = await this.emailService.sendTemplate('test-email', locale, to, {
      sentAt: new Date().toISOString(),
    });
    return { to, locale, subject, messageId };
  }
}
