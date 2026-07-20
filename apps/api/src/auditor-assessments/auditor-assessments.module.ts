import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuditorAssessmentsController } from './auditor-assessments.controller';
import { AuditorAssessmentsService } from './auditor-assessments.service';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [AuditorAssessmentsController],
  providers: [AuditorAssessmentsService],
})
export class AuditorAssessmentsModule {}
