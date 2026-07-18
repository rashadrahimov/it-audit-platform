import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { PrivacyController } from './privacy.controller';
import { ProcessingActivitiesService } from './processing-activities.service';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [PrivacyController],
  providers: [ProcessingActivitiesService],
})
export class PrivacyModule {}
