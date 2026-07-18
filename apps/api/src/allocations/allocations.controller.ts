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
import { AllocationsService } from './allocations.service';

const createSchema = z.object({
  engagementId: z.uuid(),
  membershipId: z.uuid(),
  allocatedHours: z.number().positive(),
  period: z.string().optional(),
});

@Controller('allocations')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class AllocationsController {
  constructor(private readonly service: AllocationsService) {}

  @Post()
  @RequirePermission('engagement', 'edit', 'edit')
  @ApiOperation({ summary: 'Аллокация ресурса на аудит (T-102, SCH-02)' })
  @ApiCreatedResponse({ description: '{id}' })
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.create(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Get('utilization')
  @RequirePermission('engagement', 'view')
  @ApiOperation({ summary: 'Утилизация члена: аллокация vs capacity (T-102, SCH-03)' })
  @ApiQuery({ name: 'membershipId', required: true })
  @ApiQuery({ name: 'capacity', required: true })
  utilization(
    @Req() req: TenantRequest,
    @Query('membershipId') membershipId?: string,
    @Query('capacity') capacity?: string,
  ) {
    if (!membershipId) throw new BadRequestException('Нужен membershipId');
    const cap = Number(capacity);
    if (!Number.isFinite(cap) || cap < 0) throw new BadRequestException('capacity: неотрицательное число');
    return this.service.utilization(req.tenantId, membershipId, cap);
  }
}
