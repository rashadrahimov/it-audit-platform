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
  registerRequestSchema,
  type AuthTokenResponse,
  type MeResponse,
} from '@it-audit/shared';
import { AuthService } from './auth.service';
import { JwtAuthGuard, type AuthenticatedRequest } from './jwt-auth.guard';

function parse<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body ?? {});
  if (!result.success) throw new BadRequestException(result.error.issues);
  return result.data;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
  login(@Body() body: unknown, @Req() req: AuthenticatedRequest): Promise<AuthTokenResponse> {
    return this.authService.login(parse(loginRequestSchema, body), {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
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
}
