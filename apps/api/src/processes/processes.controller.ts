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
import { i18nTextSchema } from '@it-audit/shared';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { ProcessesService } from './processes.service';

const createSchema = z.object({
  nameI18n: i18nTextSchema,
  criticality: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  subsidiaryId: z.uuid().optional(),
  ownerMembershipId: z.uuid().optional(),
  scoring: z.record(z.string(), z.unknown()).optional(),
});

@Controller('processes')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class ProcessesController {
  constructor(private readonly service: ProcessesService) {}

  @Post()
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Создать бизнес-процесс + проекция в universe (T-067, ADR-0016)' })
  @ApiCreatedResponse({ description: '{id, entityId, scope} — процесс и его узел universe' })
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
  @ApiOperation({ summary: 'Каталог процессов (групповые + локальные)' })
  list(@Req() req: TenantRequest) {
    return this.service.list(req.tenantId);
  }

  @Get(':id')
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Карточка процесса' })
  get(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(req.tenantId, id);
  }
}
