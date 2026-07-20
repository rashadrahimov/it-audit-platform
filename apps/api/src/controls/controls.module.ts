import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { ControlsController } from './controls.controller';
import { ControlsService } from './controls.service';

@Module({
  imports: [AuthModule, RbacModule, AuditModule],
  controllers: [ControlsController],
  providers: [ControlsService],
})
export class ControlsModule {}
