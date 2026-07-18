import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { PrivacyController } from './privacy.controller';
import { PrivacyAssessmentsService } from './privacy-assessments.service';
import { ProcessingActivitiesService } from './processing-activities.service';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [PrivacyController],
  providers: [ProcessingActivitiesService, PrivacyAssessmentsService],
})
export class PrivacyModule {}
