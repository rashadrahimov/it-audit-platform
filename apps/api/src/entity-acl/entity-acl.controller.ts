import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation } from '@nestjs/swagger';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { ACL_ENTITY_TYPES, EntityAclService } from './entity-acl.service';

const grantSchema = z.object({
  entityType: z.enum(ACL_ENTITY_TYPES),
  entityId: z.uuid(),
  membershipId: z.uuid(),
  level: z.enum(['view', 'edit']).optional(),
});

/**
 * T-V48 (ADR-0021): «Manage access» — per-entity ACL. Управление гранты требуют
 * edit на сущности (для risk — control/edit). Просмотр списка грантов — control/view.
 */
@Controller('entity-acl')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class EntityAclController {
  constructor(private readonly service: EntityAclService) {}

  @Get()
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Гранты доступа к сущности (?entityType=&entityId=)' })
  list(
    @Req() req: TenantRequest,
    @Query('entityType') entityType: string,
    @Query('entityId') entityId: string,
  ) {
    if (!entityType || !entityId) throw new BadRequestException('Нужны entityType и entityId');
    return this.service.listFor(req.tenantId, entityType, entityId);
  }

  @Post()
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Выдать доступ membership к сущности (upsert уровня)' })
  grant(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = grantSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.grant(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Отозвать грант доступа' })
  async revoke(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.service.revoke({ tenantId: req.tenantId, userId: req.user.sub, ip: req.ip }, id);
  }
}
