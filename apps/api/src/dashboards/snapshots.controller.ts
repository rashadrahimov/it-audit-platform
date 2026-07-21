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
import { SnapshotsService } from './snapshots.service';

const createSchema = z.object({ label: z.string().min(1) });

@Controller('snapshots')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class SnapshotsController {
  constructor(private readonly service: SnapshotsService) {}

  @Post()
  @RequirePermission('report', 'export', 'edit')
  @ApiOperation({ summary: 'Зафиксировать снапшот метрик на дату (T-073, B10)' })
  @ApiCreatedResponse({ description: '{id, label, capturedAt}' })
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.create(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data.label,
    );
  }

  @Get()
  @RequirePermission('report', 'export', 'view')
  @ApiOperation({ summary: 'Список снапшотов тенанта' })
  list(@Req() req: TenantRequest) {
    return this.service.list(req.tenantId);
  }

  @Get('latest-diff')
  @RequirePermission('report', 'export', 'view')
  @ApiOperation({ summary: 'T-H39: diff последнего снапшота с текущими findings' })
  latestDiff(@Req() req: TenantRequest) {
    return this.service.latestDiff(req.tenantId);
  }

  @Get(':id')
  @RequirePermission('report', 'export', 'view')
  @ApiOperation({ summary: 'Исторический снапшот (замороженные метрики)' })
  get(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(req.tenantId, id);
  }
}
