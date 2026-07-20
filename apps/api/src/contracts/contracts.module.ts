import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';

@Module({
  imports: [AuthModule, RbacModule, AuditModule],
  controllers: [ContractsController],
  providers: [ContractsService],
})
export class ContractsModule {}
