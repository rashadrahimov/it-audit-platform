import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuditFirmsController } from './audit-firms.controller';
import { AuditFirmsService } from './audit-firms.service';

@Module({
  imports: [AuthModule, RbacModule, AuditModule],
  controllers: [AuditFirmsController],
  providers: [AuditFirmsService],
  exports: [AuditFirmsService],
})
export class AuditFirmsModule {}
