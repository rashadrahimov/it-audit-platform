import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { AuthModule } from './auth.module';
import { SsoConfigController } from './sso-config.controller';

/**
 * CRUD per-tenant SSO-конфига (V49). Отдельный модуль: нужен PermissionGuard
 * (RbacModule), а SsoConfigService берём экспортом из AuthModule — без цикла
 * AuthModule↔RbacModule. Публичный /auth/sso/dispatch живёт в AuthController.
 */
@Module({
  imports: [AuthModule, RbacModule],
  controllers: [SsoConfigController],
})
export class SsoConfigModule {}
