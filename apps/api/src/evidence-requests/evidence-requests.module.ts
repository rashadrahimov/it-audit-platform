import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RbacModule } from '../rbac/rbac.module';
import { EvidenceRequestsController } from './evidence-requests.controller';
import { EvidenceRequestsService } from './evidence-requests.service';

@Module({
  imports: [AuthModule, RbacModule, NotificationsModule],
  controllers: [EvidenceRequestsController],
  providers: [EvidenceRequestsService],
})
export class EvidenceRequestsModule {}
