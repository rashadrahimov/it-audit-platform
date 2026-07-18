import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { RiskAssessmentsController } from './risk-assessments.controller';
import { RiskAssessmentsService } from './risk-assessments.service';
import { RisksController } from './risks.controller';
import { RisksService } from './risks.service';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [RisksController, RiskAssessmentsController],
  providers: [RisksService, RiskAssessmentsService],
  exports: [RisksService],
})
export class RisksModule {}
