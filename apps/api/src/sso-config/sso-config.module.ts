import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { SsoConfigController } from './sso-config.controller';
import { SsoConfigService } from './sso-config.service';

/** T-V49: per-tenant SSO-конфиг. */
@Module({
  imports: [AuthModule, RbacModule],
  controllers: [SsoConfigController],
  providers: [SsoConfigService],
  exports: [SsoConfigService],
})
export class SsoConfigModule {}
