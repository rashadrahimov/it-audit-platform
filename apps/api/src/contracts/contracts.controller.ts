import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import { ContractsService } from './contracts.service';

const createSchema = z.object({
  name: z.string().min(1).max(300),
  counterparty: z.string().max(300).optional(),
  status: z.enum(['active', 'expired', 'terminated']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  note: z.string().max(2000).optional(),
});

@Controller('contracts')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class ContractsController {
  constructor(private readonly service: ContractsService) {}

  @Get()
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Реестр контрактов (T-V31)' })
  list(@Req() req: TenantRequest) {
    return this.service.list(req.tenantId);
  }

  @Post()
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Создать контракт (T-V31)' })
  @ApiCreatedResponse({ description: '{id, name, status}' })
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.create(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Delete(':id')
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Удалить контракт (T-V31)' })
  remove(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove({ tenantId: req.tenantId, userId: req.user.sub, ip: req.ip }, id);
  }
}
