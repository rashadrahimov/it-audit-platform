import { Controller, Get, Header, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiQuery } from '@nestjs/swagger';
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

  @Get('syslog')
  @RequirePermission('settings', 'view')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @ApiOperation({ summary: 'Экспорт security-логов в RFC 5424 syslog (T-H09, LOG-06)' })
  @ApiQuery({ name: 'limit', required: false })
  syslog(@Req() req: TenantRequest, @Query('limit') limit?: string) {
    const n = Number(limit);
    return this.auditLogService.syslogExport(req.tenantId, Number.isFinite(n) && n > 0 ? n : 200);
  }
}
