import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { env } from '../env';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LdapController } from './ldap.controller';
import { LdapService } from './ldap.service';
import { MfaService } from './mfa.service';
import { OidcController } from './oidc.controller';
import { OidcService } from './oidc.service';
import { PasswordService } from './password.service';
import { SamlController } from './saml.controller';
import { SamlService } from './saml.service';
import { SsoUserService } from './sso-user.service';

@Module({
  imports: [
    JwtModule.register({
      secret: env.jwtSecret,
      signOptions: { expiresIn: env.jwtTtlSeconds },
    }),
  ],
  controllers: [AuthController, OidcController, SamlController, LdapController],
  providers: [
    AuthService,
    LdapService,
    MfaService,
    OidcService,
    SamlService,
    SsoUserService,
    PasswordService,
    JwtAuthGuard,
  ],
  exports: [JwtAuthGuard, JwtModule, PasswordService],
})
export class AuthModule {}
