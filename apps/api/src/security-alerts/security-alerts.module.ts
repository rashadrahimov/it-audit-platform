import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IncidentsModule } from '../incidents/incidents.module';
import { RbacModule } from '../rbac/rbac.module';
import { SlaConfigModule } from '../sla-config/sla-config.module';
import { SecurityAlertsController } from './security-alerts.controller';
import { SecurityAlertsService } from './security-alerts.service';

@Module({
  imports: [AuthModule, RbacModule, SlaConfigModule, IncidentsModule],
  controllers: [SecurityAlertsController],
  providers: [SecurityAlertsService],
})
export class SecurityAlertsModule {}
