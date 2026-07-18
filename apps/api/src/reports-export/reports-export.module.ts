import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { ReportsExportController } from './reports-export.controller';
import { ReportsExportService } from './reports-export.service';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [ReportsExportController],
  providers: [ReportsExportService],
})
export class ReportsExportModule {}
