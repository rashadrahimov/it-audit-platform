import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RbacModule } from '../rbac/rbac.module';
import { AttestationsService } from './attestations.service';
import { PoliciesController } from './policies.controller';
import { PoliciesService } from './policies.service';

@Module({
  imports: [AuthModule, RbacModule, EmailModule, NotificationsModule],
  controllers: [PoliciesController],
  providers: [PoliciesService, AttestationsService],
  exports: [PoliciesService],
})
export class PoliciesModule {}
