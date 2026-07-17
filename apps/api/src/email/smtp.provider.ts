import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { env } from '../env';
import type { EmailProvider, OutgoingEmail } from './email.provider';

@Injectable()
export class SmtpEmailProvider implements EmailProvider, OnModuleDestroy {
  private readonly transport: Transporter = createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: false, // Mailpit/внутренний релей; TLS-настройки появятся с реальным SMTP клиента
  });

  async send(email: OutgoingEmail): Promise<{ messageId: string }> {
    const info = await this.transport.sendMail({ from: env.smtpFrom, ...email });
    return { messageId: info.messageId };
  }

  onModuleDestroy(): void {
    this.transport.close();
  }
}
