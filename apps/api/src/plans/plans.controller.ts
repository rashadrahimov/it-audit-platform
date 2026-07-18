import {
  BadRequestException,
  Body,
  Controller,
  Get,
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
import { PlansService } from './plans.service';

const createSchema = z.object({
  name: z.string().min(1),
  year: z.number().int().optional(),
  capacityHours: z.number().nonnegative().optional(),
});

const itemSchema = z.object({
  auditableEntityId: z.uuid(),
  plannedHours: z.number().nonnegative().optional(),
  plannedQuarter: z.string().optional(),
  recurrence: z.unknown().optional(),
});

@Controller('plans')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class PlansController {
  constructor(private readonly service: PlansService) {}

  @Post()
  @RequirePermission('engagement', 'edit', 'edit')
  @ApiOperation({ summary: 'Создать годовой план (T-100, EP-PLAN)' })
  @ApiCreatedResponse({ description: '{id, status}' })
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.create(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Post(':id/items')
  @RequirePermission('engagement', 'edit', 'edit')
  @ApiOperation({ summary: 'Добавить узел universe в план (priority по риску, UNI-04)' })
  addItem(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = itemSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.addItem(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data,
    );
  }

  @Get()
  @RequirePermission('engagement', 'view')
  @ApiOperation({ summary: 'Планы тенанта' })
  list(@Req() req: TenantRequest) {
    return this.service.list(req.tenantId);
  }

  @Get(':id/capacity')
  @RequirePermission('engagement', 'view')
  @ApiOperation({ summary: 'Capacity: план по часам vs ёмкость (T-101)' })
  capacity(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.capacity(req.tenantId, id);
  }

  @Get(':id')
  @RequirePermission('engagement', 'view')
  @ApiOperation({ summary: 'План + items (сортировка по приоритету)' })
  get(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(req.tenantId, id);
  }
}
