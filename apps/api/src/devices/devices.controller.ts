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
import { DevicesService } from './devices.service';

const checksShape = {
  diskEncryption: z.boolean().optional(),
  screenLock: z.boolean().optional(),
  antivirus: z.boolean().optional(),
  passwordPolicy: z.boolean().optional(),
};

const createSchema = z.object({
  name: z.string().min(1),
  os: z.string().optional(),
  serial: z.string().optional(),
  ownerPersonnelId: z.uuid().optional(),
  ...checksShape,
});

const checksSchema = z
  .object(checksShape)
  .refine((v) => Object.keys(v).length > 0, 'Нужна хотя бы одна проверка');

const importSchema = z.object({ connectorId: z.uuid() });

@Controller('devices')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class DevicesController {
  constructor(private readonly service: DevicesService) {}

  @Post()
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Завести endpoint + вычислить compliance (T-070, B12)' })
  @ApiCreatedResponse({ description: '{id, complianceStatus}' })
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.create(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Post(':id/checks')
  @HttpCode(200)
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Обновить проверки → пересчёт compliance_status' })
  updateChecks(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = checksSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.updateChecks(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data,
    );
  }

  @Post('import')
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Авто-обнаружение устройств из MDM-коннектора (T-071, B12)' })
  @ApiCreatedResponse({ description: '{imported, updated}' })
  import(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = importSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.importFromConnector(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data.connectorId,
    );
  }

  @Get()
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Endpoint-устройства тенанта' })
  list(@Req() req: TenantRequest) {
    return this.service.list(req.tenantId);
  }
}
