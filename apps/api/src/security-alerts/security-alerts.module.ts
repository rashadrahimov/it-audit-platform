import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { SecurityAlertsController } from './security-alerts.controller';
import { SecurityAlertsService } from './security-alerts.service';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [SecurityAlertsController],
  providers: [SecurityAlertsService],
})
export class SecurityAlertsModule {}
