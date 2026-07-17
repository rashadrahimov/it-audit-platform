import { Module } from '@nestjs/common';
import { EMAIL_PROVIDER } from './email.provider';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';
import { SmtpEmailProvider } from './smtp.provider';

@Module({
  controllers: [EmailController],
  providers: [EmailService, { provide: EMAIL_PROVIDER, useClass: SmtpEmailProvider }],
  exports: [EmailService],
})
export class EmailModule {}
