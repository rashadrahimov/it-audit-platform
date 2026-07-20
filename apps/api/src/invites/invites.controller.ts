import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiHeader, ApiOperation } from '@nestjs/swagger';
import { z } from 'zod';
import { localeSchema, membershipCategorySchema } from '@it-audit/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { InvitesService } from './invites.service';

const inviteSchema = z.object({
  email: z.email(),
  roleId: z.uuid(),
  isAuditSeat: z.boolean().optional().default(false),
  locale: localeSchema.optional().default('en'),
  // T-108: категория стороны + scoped-доступ (внешний аудитор видит только эти дочки).
  category: membershipCategorySchema.optional().default('auditor'),
  subsidiaryScope: z.array(z.uuid()).nullable().optional(),
});

const acceptSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(1),
  fullName: z.string().min(1).optional(),
});

@Controller('invites')
export class InvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermission('settings', 'edit', 'edit')
  @ApiBearerAuth()
  @ApiHeader({ name: 'X-Tenant-Slug', required: true })
  @ApiOperation({ summary: 'Пригласить пользователя: письмо с токеном (T-015, LOG-05)' })
  @ApiCreatedResponse({
    description: '{userId, warnings[]} — мягкие квота-предупреждения ADR-0014',
  })
  invite(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = inviteSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.invitesService.invite(req.tenantId, parsed.data, {
      userId: req.user.sub,
      ip: req.ip,
    });
  }

  @Post('accept')
  @HttpCode(204)
  @ApiOperation({ summary: 'Принять приглашение: установить пароль, активировать аккаунт' })
  async accept(@Body() body: unknown): Promise<void> {
    const parsed = acceptSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    await this.invitesService.accept(parsed.data.token, parsed.data.password, parsed.data.fullName);
  }
}
