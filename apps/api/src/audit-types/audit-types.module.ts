import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuditTypesController } from './audit-types.controller';
import { AuditTypesService } from './audit-types.service';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [AuditTypesController],
  providers: [AuditTypesService],
})
export class AuditTypesModule {}
