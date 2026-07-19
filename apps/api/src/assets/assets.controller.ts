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
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { filterParam } from '../list-filters';
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

const importSchema = z.object({
  connectorId: z.uuid(),
  type: z.enum(['erp', 'db', 'network', 'app', 'cloud', 'endpoint', 'other']).optional(),
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

  @Post('import')
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({
    summary: 'Авто-обнаружение активов из коннектора (T-068, B3, capability=inventory)',
  })
  @ApiCreatedResponse({ description: '{imported, updated}' })
  import(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = importSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.importFromConnector(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data.connectorId,
      parsed.data.type,
    );
  }

  @Post('bulk-tag')
  @HttpCode(200)
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Bulk-тег активов (T-V11): find-or-create тега + привязка' })
  bulkTag(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = z
      .object({ assetIds: z.array(z.uuid()).min(1), tagName: z.string().min(1).max(64) })
      .safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.bulkTag(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data.assetIds,
      parsed.data.tagName.trim(),
    );
  }

  @Get()
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Реестр активов тенанта (owner/источник/теги); фильтр ?type=' })
  @ApiQuery({ name: 'type', required: false })
  list(@Req() req: TenantRequest, @Query('type') type?: string) {
    return this.service.list(req.tenantId, { type: filterParam(type, 'type') });
  }

  @Get(':id')
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Карточка актива' })
  get(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(req.tenantId, id);
  }
}
