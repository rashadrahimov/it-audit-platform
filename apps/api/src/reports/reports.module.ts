import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { ReportDataService } from './report-data.service';
import { ReportsController } from './reports.controller';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [ReportsController],
  providers: [ReportDataService],
})
export class ReportsModule {}
