import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuditController } from './audit.controller';
import { AuditLogService } from './audit-log.service';

/** Global: журналирование нужно каждому доменному модулю. */
@Global()
@Module({
  imports: [AuthModule, RbacModule],
  controllers: [AuditController],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditModule {}
