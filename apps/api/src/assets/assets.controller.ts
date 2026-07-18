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
import { AssetsService } from './assets.service';

const createSchema = z.object({
  type: z.enum(['erp', 'db', 'network', 'app', 'cloud', 'endpoint', 'other']),
  name: z.string().min(1),
  subsidiaryId: z.uuid().optional(),
  ownerMembershipId: z.uuid().optional(),
  attrs: z.record(z.string(), z.unknown()).optional(),
  custom: z.record(z.string(), z.unknown()).optional(),
});

@Controller('assets')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class AssetsController {
  constructor(private readonly service: AssetsService) {}

  @Post()
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Создать ИТ-актив + проекция в universe (T-066)' })
  @ApiCreatedResponse({ description: '{id, entityId} — актив и его узел universe' })
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.create(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Get()
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Реестр активов тенанта' })
  list(@Req() req: TenantRequest) {
    return this.service.list(req.tenantId);
  }

  @Get(':id')
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Карточка актива' })
  get(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(req.tenantId, id);
  }
}
