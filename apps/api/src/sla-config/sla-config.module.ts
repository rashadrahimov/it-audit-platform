import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { SlaConfigController } from './sla-config.controller';
import { SlaConfigService } from './sla-config.service';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [SlaConfigController],
  providers: [SlaConfigService],
  exports: [SlaConfigService],
})
export class SlaConfigModule {}
