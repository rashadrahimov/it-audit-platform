import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
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
import { ControlKpisService } from './control-kpis.service';

const createSchema = z.object({
  controlId: z.uuid(),
  name: z.string().min(1),
  unit: z.string().optional(),
  targetValue: z.number().optional(),
  currentValue: z.number().optional(),
  direction: z.enum(['higher_better', 'lower_better']).optional(),
  period: z.string().optional(),
});

@Controller('control-kpis')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class ControlKpisController {
  constructor(private readonly service: ControlKpisService) {}

  @Post()
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'KPI контроля (T-106, CTL-04)' })
  @ApiCreatedResponse({ description: '{id}' })
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.create(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Post(':id/value')
  @HttpCode(200)
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Замер текущего значения KPI → on-track' })
  setValue(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = z.object({ currentValue: z.number() }).safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.setValue(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data.currentValue,
    );
  }

  @Get()
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'KPI контроля (?controlId)' })
  @ApiQuery({ name: 'controlId', required: true })
  list(@Req() req: TenantRequest, @Query('controlId') controlId?: string) {
    if (!controlId) throw new BadRequestException('Нужен controlId');
    return this.service.listForControl(req.tenantId, controlId);
  }
}
