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
import { ApiBearerAuth, ApiCreatedResponse, ApiHeader, ApiOperation } from '@nestjs/swagger';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { VulnerabilitiesService } from './vulnerabilities.service';

const createSchema = z.object({
  title: z.string().min(1),
  cve: z.string().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  description: z.string().optional(),
  dueDate: z.iso.datetime().optional(),
  assetId: z.uuid().optional(),
});

@Controller('vulnerabilities')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class VulnerabilitiesController {
  constructor(private readonly service: VulnerabilitiesService) {}

  @Post()
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Создать уязвимость (T-062, B13)' })
  @ApiCreatedResponse({ description: 'Уязвимость в статусе open' })
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.create(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Post(':id/transition')
  @HttpCode(200)
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Lifecycle (T-062): open→remediating→resolved' })
  transition(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = z
      .object({ to: z.enum(['open', 'remediating', 'resolved']) })
      .safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.transition(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data.to,
    );
  }

  @Get()
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Реестр уязвимостей (фильтры: status/severity)' })
  list(
    @Req() req: TenantRequest,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
  ) {
    return this.service.list(req.tenantId, { status, severity });
  }

  @Get('by-asset')
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Уязвимости по активам + агрегат Asset SLA status (T-V32)' })
  byAsset(@Req() req: TenantRequest) {
    return this.service.byAsset(req.tenantId);
  }
}
