import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery } from '@nestjs/swagger';
import type { PermissionDto, RoleWithMatrix } from '@it-audit/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacService } from './rbac.service';

@Controller('rbac')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('permissions')
  @ApiOperation({ summary: 'Каталог прав (resource × action)' })
  @ApiOkResponse({ description: 'Глобальный каталог' })
  permissions(): Promise<PermissionDto[]> {
    return this.rbacService.permissions();
  }

  @Get('roles')
  @ApiOperation({ summary: 'Роли с матрицей уровней (глобальные + тенантские)' })
  @ApiQuery({ name: 'tenantSlug', required: false, description: 'До T-020: тенант явно' })
  @ApiOkResponse({ description: 'Роли и их матрицы' })
  roles(@Query('tenantSlug') tenantSlug?: string): Promise<RoleWithMatrix[]> {
    return this.rbacService.roles(tenantSlug);
  }
}
