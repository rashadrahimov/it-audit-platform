import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { SlaConfigModule } from '../sla-config/sla-config.module';
import { VulnerabilitiesController } from './vulnerabilities.controller';
import { VulnerabilitiesService } from './vulnerabilities.service';

@Module({
  imports: [AuthModule, RbacModule, SlaConfigModule],
  controllers: [VulnerabilitiesController],
  providers: [VulnerabilitiesService],
})
export class VulnerabilitiesModule {}
