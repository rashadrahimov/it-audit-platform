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
  constructor(private readonly service: NotificationsService) {}

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
