import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiHeader, ApiOperation } from '@nestjs/swagger';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { NotificationDispatchService } from './notification-dispatch.service';
import { NotificationsService } from './notifications.service';

const createSchema = z.object({
  recipientMembershipId: z.uuid(),
  title: z.string().min(1),
  type: z.enum(['info', 'warning', 'action']).optional(),
  body: z.string().optional(),
});

@Controller('notifications')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class NotificationsController {
  constructor(
    private readonly service: NotificationsService,
    private readonly dispatch: NotificationDispatchService,
  ) {}

  @Get('settings')
  @RequirePermission('settings', 'view')
  @ApiOperation({ summary: 'T-V19: настройки уведомлений тенанта (расписание/таймзона/email)' })
  settings(@Req() req: TenantRequest) {
    return this.dispatch.settingsOf(req.tenantId);
  }

  @Post('settings')
  @HttpCode(200)
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({
    summary: 'T-V19: сохранить настройки уведомлений (anytime | work_hours 9–18 + TZ)',
  })
  saveSettings(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = z
      .object({
        emailEnabled: z.boolean().optional(),
        schedule: z.enum(['anytime', 'work_hours']).optional(),
        timezone: z.string().min(1).max(64).optional(),
        digest: z.enum(['weekly', 'daily', 'off']).optional(),
      })
      .safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.dispatch.saveSettings(req.tenantId, parsed.data);
  }

  @Post()
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Отправить уведомление адресату (T-096, GEN-04)' })
  @ApiCreatedResponse({ description: '{id}' })
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.create(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Get()
  @RequirePermission('engagement', 'view')
  @ApiOperation({ summary: 'Мои уведомления + счётчик непрочитанных' })
  listMine(@Req() req: TenantRequest) {
    return this.service.listMine({ tenantId: req.tenantId, userId: req.user.sub, ip: req.ip });
  }

  @Post(':id/read')
  @HttpCode(200)
  @RequirePermission('engagement', 'view')
  @ApiOperation({ summary: 'Отметить прочитанным (только своё)' })
  markRead(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.markRead({ tenantId: req.tenantId, userId: req.user.sub, ip: req.ip }, id);
  }
}
