import { Global, Module } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';

/** Global: журналирование нужно каждому доменному модулю. */
@Global()
@Module({
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditModule {}
