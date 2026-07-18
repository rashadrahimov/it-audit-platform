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
import { ApiKeysService } from './api-keys.service';

const createSchema = z.object({ name: z.string().min(1) });

@Controller('api-keys')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class ApiKeysController {
  constructor(private readonly service: ApiKeysService) {}

  @Post()
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Сгенерировать API-ключ (T-090; plaintext возвращается один раз)' })
  @ApiCreatedResponse({ description: '{id, name, prefix, key} — key больше не показывается' })
  generate(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.generate(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data.name,
    );
  }

  @Get()
  @RequirePermission('settings', 'view')
  @ApiOperation({ summary: 'API-ключи тенанта (без секретов)' })
  list(@Req() req: TenantRequest) {
    return this.service.list(req.tenantId);
  }

  @Delete(':id')
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Отозвать API-ключ' })
  revoke(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.revoke({ tenantId: req.tenantId, userId: req.user.sub, ip: req.ip }, id);
  }
}
