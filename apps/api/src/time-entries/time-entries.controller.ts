import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiHeader, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { TimeEntriesService } from './time-entries.service';

const createSchema = z.object({
  date: z.iso.datetime(),
  hours: z.number().positive().max(24),
  engagementId: z.uuid().optional(),
  phase: z.enum(['planning', 'fieldwork', 'reporting']).optional(),
  category: z.enum(['audit', 'training', 'leave', 'admin']).optional(),
  billableRate: z.number().nonnegative().optional(),
  note: z.string().optional(),
});

@Controller('time-entries')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class TimeEntriesController {
  constructor(private readonly service: TimeEntriesService) {}

  @Post()
  @RequirePermission('engagement', 'view')
  @ApiOperation({ summary: 'Тайм-запись по аудиту/фазе/категории (T-088, TIME-01)' })
  @ApiCreatedResponse({ description: '{id, hours}' })
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
  @ApiOperation({ summary: 'Тайм-записи (?engagementId — фильтр)' })
  @ApiQuery({ name: 'engagementId', required: false })
  list(@Req() req: TenantRequest, @Query('engagementId') engagementId?: string) {
    return this.service.list(req.tenantId, engagementId);
  }
}
