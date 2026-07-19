import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { MigrationController } from './migration.controller';
import { MigrationService } from './migration.service';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [MigrationController],
  providers: [MigrationService],
})
export class MigrationModule {}
