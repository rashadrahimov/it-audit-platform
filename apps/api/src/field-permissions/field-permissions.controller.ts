import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
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
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { FieldPermissionsService } from './field-permissions.service';

const upsertSchema = z.object({
  roleId: z.uuid(),
  entityType: z.string().min(1),
  field: z.string().min(1),
  level: z.enum(['hidden', 'view', 'edit']),
});

@Controller('field-permissions')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class FieldPermissionsController {
  constructor(private readonly service: FieldPermissionsService) {}

  @Get()
  @RequirePermission('settings', 'view')
  @ApiOperation({ summary: 'Field-level права тенанта (?roleId — фильтр, SEC-04)' })
  @ApiQuery({ name: 'roleId', required: false })
  list(@Req() req: TenantRequest, @Query('roleId') roleId?: string) {
    return this.service.list(req.tenantId, roleId);
  }

  @Post()
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Задать/обновить field-level право роли тенанта' })
  @ApiCreatedResponse({ description: '{id}' })
  upsert(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = upsertSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.upsert(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Delete(':id')
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Снять field-level право' })
  remove(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove({ tenantId: req.tenantId, userId: req.user.sub, ip: req.ip }, id);
  }
}
