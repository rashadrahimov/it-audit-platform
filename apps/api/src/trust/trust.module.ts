import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { TrustAdminController } from './trust-admin.controller';
import { TrustPublicController } from './trust-public.controller';
import { TrustService } from './trust.service';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [TrustAdminController, TrustPublicController],
  providers: [TrustService],
  exports: [TrustService],
})
export class TrustModule {}
