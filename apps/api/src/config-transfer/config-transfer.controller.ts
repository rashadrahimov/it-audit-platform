import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { ConfigTransferService } from './config-transfer.service';

@Controller('config')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class ConfigTransferController {
  constructor(private readonly service: ConfigTransferService) {}

  @Get('export')
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Экспорт кастомной конфигурации тенанта (T-105, TEC-04)' })
  @ApiOkResponse({ description: 'JSON-бандл {version, auditTypes, configLists, customFieldDefs, glossaryTerms}' })
  exportConfig(@Req() req: TenantRequest) {
    return this.service.export(req.tenantId);
  }

  @Post('import')
  @HttpCode(200)
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Импорт конфигурации из бандла (idempotent upsert); мусор→400' })
  importConfig(@Req() req: TenantRequest, @Body() body: unknown) {
    return this.service.import({ tenantId: req.tenantId, userId: req.user.sub, ip: req.ip }, body);
  }
}
