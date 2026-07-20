import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { z } from 'zod';
import {
  changePasswordRequestSchema,
  loginRequestSchema,
  magicLinkConsumeSchema,
  magicLinkRequestSchema,
  mfaEnableRequestSchema,
  mfaVerifyRequestSchema,
  registerRequestSchema,
  ssoDispatchRequestSchema,
  type AuthTokenResponse,
  type LoginResponse,
  type MagicLinkRequestResponse,
  type MeResponse,
  type MeTenantsResponse,
  type MfaEnableResponse,
  type MfaSetupResponse,
  type SsoDispatchResponse,
} from '@it-audit/shared';
import { AuthService } from './auth.service';
import { JwtAuthGuard, type AuthenticatedRequest } from './jwt-auth.guard';
import { MagicLinkService } from './magic-link.service';
import { MfaService } from './mfa.service';
import { SsoConfigService } from './sso-config.service';

function parse<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body ?? {});
  if (!result.success) throw new BadRequestException(result.error.issues);
  return result.data;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly mfaService: MfaService,
    private readonly magicLinkService: MagicLinkService,
    private readonly ssoConfigService: SsoConfigService,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Регистрация локального аккаунта (полный invite-flow — T-015)' })
  @ApiCreatedResponse({ description: 'Аккаунт создан' })
  register(@Body() body: unknown): Promise<MeResponse> {
    return this.authService.register(parse(registerRequestSchema, body));
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Логин по email+паролю → JWT; вход журналируется с IP (LOG-04)' })
  @ApiOkResponse({ description: 'Bearer-токен' })
  @ApiUnauthorizedResponse({ description: 'Неверные креды или аккаунт заблокирован' })
  login(@Body() body: unknown, @Req() req: AuthenticatedRequest): Promise<LoginResponse> {
    return this.authService.login(parse(loginRequestSchema, body), {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('magic-link/request')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Passwordless: запросить ссылку-вход по email (ответ всегда «accepted»)',
  })
  @ApiOkResponse({ description: 'Запрос принят (существование аккаунта не раскрывается)' })
  async magicLinkRequest(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ): Promise<MagicLinkRequestResponse> {
    await this.magicLinkService.request(parse(magicLinkRequestSchema, body), {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return { status: 'accepted' };
  }

  @Post('magic-link/consume')
  @HttpCode(200)
  @ApiOperation({ summary: 'Passwordless: обменять ссылку на сессию → JWT (или MFA-челлендж)' })
  @ApiOkResponse({ description: 'Bearer-токен либо MFA-челлендж' })
  @ApiUnauthorizedResponse({ description: 'Ссылка недействительна или истекла' })
  magicLinkConsume(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ): Promise<LoginResponse> {
    const { token } = parse(magicLinkConsumeSchema, body);
    return this.magicLinkService.consume(token, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('sso/dispatch')
  @HttpCode(200)
  @ApiOperation({
    summary: 'SSO home-realm discovery: по email-домену — пароль или редирект на IdP (V49)',
  })
  @ApiOkResponse({
    description: 'Решение: {dispatch:"password"} либо {dispatch:"sso", redirectPath}',
  })
  ssoDispatch(@Body() body: unknown): Promise<SsoDispatchResponse> {
    const { email } = parse(ssoDispatchRequestSchema, body);
    return this.ssoConfigService.dispatch(email);
  }

  @Post('mfa/setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'MFA: сгенерировать секрет и QR (T-014)' })
  mfaSetup(@Req() req: AuthenticatedRequest): Promise<MfaSetupResponse> {
    return this.mfaService.setup(req.user.sub);
  }

  @Post('mfa/enable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'MFA: включить по TOTP-коду; вернёт recovery-коды (один раз)' })
  mfaEnable(@Req() req: AuthenticatedRequest, @Body() body: unknown): Promise<MfaEnableResponse> {
    const { code } = parse(mfaEnableRequestSchema, body);
    return this.mfaService.enable(req.user.sub, code);
  }

  @Post('mfa/verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Второй шаг логина: mfaToken + TOTP/recovery-код → JWT' })
  @ApiOkResponse({ description: 'Bearer-токен' })
  mfaVerify(@Body() body: unknown, @Req() req: AuthenticatedRequest): Promise<AuthTokenResponse> {
    const { mfaToken, code } = parse(mfaVerifyRequestSchema, body);
    return this.mfaService.verify(mfaToken, code, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('mfa/disable')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'MFA: выключить по TOTP-коду' })
  async mfaDisable(@Req() req: AuthenticatedRequest, @Body() body: unknown): Promise<void> {
    const { code } = parse(mfaEnableRequestSchema, body);
    await this.mfaService.disable(req.user.sub, code);
  }

  @Post('change-password')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Self-service смена пароля (SEC-02)' })
  async changePassword(@Req() req: AuthenticatedRequest, @Body() body: unknown): Promise<void> {
    await this.authService.changePassword(req.user.sub, parse(changePasswordRequestSchema, body));
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Текущий пользователь по токену' })
  me(@Req() req: AuthenticatedRequest): Promise<MeResponse> {
    return this.authService.me(req.user.sub);
  }

  @Get('me/tenants')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Тенанты юзера (T-032): контекст для UI до переключателя' })
  meTenants(@Req() req: AuthenticatedRequest): Promise<MeTenantsResponse> {
    return this.authService.meTenants(req.user.sub);
  }
}
