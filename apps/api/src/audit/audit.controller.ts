import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { AuditLogService } from './audit-log.service';

@Controller('audit')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class AuditController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get('verify-chain')
  @RequirePermission('settings', 'view')
  @ApiOperation({ summary: 'Проверка целостности hash-chain журнала (T-104, LOG-01)' })
  @ApiOkResponse({ description: '{valid, checked, brokenAt?, reason?}' })
  verifyChain(@Req() req: TenantRequest) {
    return this.auditLogService.verifyChain(req.tenantId);
  }
}
