import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FindingsModule } from '../findings/findings.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RbacModule } from '../rbac/rbac.module';
import { SlaConfigModule } from '../sla-config/sla-config.module';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';

/** EP-INC (ADR-0024): инциденты ИБ — жизненный цикл, таймлайн, SLA резолюции. */
@Module({
  imports: [AuthModule, RbacModule, SlaConfigModule, NotificationsModule, FindingsModule],
  controllers: [IncidentsController],
  providers: [IncidentsService],
  exports: [IncidentsService],
})
export class IncidentsModule {}
