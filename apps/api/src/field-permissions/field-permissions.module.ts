import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { FieldPermissionsController } from './field-permissions.controller';
import { FieldPermissionsService } from './field-permissions.service';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [FieldPermissionsController],
  providers: [FieldPermissionsService],
})
export class FieldPermissionsModule {}
