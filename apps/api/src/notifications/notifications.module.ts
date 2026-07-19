import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { RbacModule } from '../rbac/rbac.module';
import { SYSTEM_QUEUE } from '../jobs/jobs.constants';
import { NotificationDispatchService } from './notification-dispatch.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [AuthModule, RbacModule, EmailModule, BullModule.registerQueue({ name: SYSTEM_QUEUE })],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationDispatchService],
  exports: [NotificationsService, NotificationDispatchService],
})
export class NotificationsModule {}
