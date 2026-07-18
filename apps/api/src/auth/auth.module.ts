import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { env } from '../env';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { MfaService } from './mfa.service';
import { OidcController } from './oidc.controller';
import { OidcService } from './oidc.service';
import { PasswordService } from './password.service';

@Module({
  imports: [
    JwtModule.register({
      secret: env.jwtSecret,
      signOptions: { expiresIn: env.jwtTtlSeconds },
    }),
  ],
  controllers: [AuthController, OidcController],
  providers: [AuthService, MfaService, OidcService, PasswordService, JwtAuthGuard],
  exports: [JwtAuthGuard, JwtModule, PasswordService],
})
export class AuthModule {}
