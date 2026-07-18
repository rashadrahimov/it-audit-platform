import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
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
import { PersonnelService } from './personnel.service';

const importSchema = z.object({ connectorId: z.uuid() });

const createSchema = z.object({
  fullName: z.string().min(1),
  email: z.email().optional(),
  departmentId: z.uuid().optional(),
  membershipId: z.uuid().optional(),
  unit: z.string().optional(),
  position: z.string().optional(),
  employmentStatus: z.enum(['active', 'onboarding', 'offboarded']).optional(),
  certificates: z.array(z.unknown()).optional(),
  contacts: z.record(z.string(), z.unknown()).optional(),
});

@Controller('personnel')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class PersonnelController {
  constructor(private readonly service: PersonnelService) {}

  @Post('import')
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Импорт профилей из personnel-коннектора (T-069, B6)' })
  @ApiCreatedResponse({ description: '{imported, updated}' })
  importFromConnector(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = importSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.importFromConnector(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data.connectorId,
    );
  }

  @Post()
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Завести профиль вручную' })
  @ApiCreatedResponse({ description: '{id, employmentStatus}' })
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.createManual(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Post(':id/status')
  @HttpCode(200)
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Сменить статус занятости (onboarding/active/offboarded)' })
  setStatus(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = z
      .object({ status: z.enum(['active', 'onboarding', 'offboarded']) })
      .safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.setStatus(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data.status,
    );
  }

  @Get()
  @RequirePermission('settings', 'view')
  @ApiOperation({ summary: 'Профили персонала тенанта' })
  list(@Req() req: TenantRequest) {
    return this.service.list(req.tenantId);
  }
}
