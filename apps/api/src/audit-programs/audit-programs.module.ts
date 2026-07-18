import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuditProgramsController } from './audit-programs.controller';
import { AuditProgramsService } from './audit-programs.service';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [AuditProgramsController],
  providers: [AuditProgramsService],
})
export class AuditProgramsModule {}
