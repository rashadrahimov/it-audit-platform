import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { SsoConfigController } from './sso-config.controller';
import { SsoConfigService } from './sso-config.service';
import { SsoDiscoveryController } from './sso-discovery.controller';

/** T-V49: per-tenant SSO-конфиг + T-V49-dispatch: публичный discovery. */
@Module({
  imports: [AuthModule, RbacModule],
  controllers: [SsoConfigController, SsoDiscoveryController],
  providers: [SsoConfigService],
  exports: [SsoConfigService],
})
export class SsoConfigModule {}
