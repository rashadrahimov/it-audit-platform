import { BadRequestException, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiQuery } from '@nestjs/swagger';
import type { PermissionDto, RoleWithMatrix } from '@it-audit/shared';
import { JwtAuthGuard, type AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { PermissionGuard } from './permission.guard';
import { RequirePermission } from './require-permission.decorator';
import { RbacService } from './rbac.service';

@Controller('rbac')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('check')
  @ApiOperation({
    summary: 'Уровень доступа текущего пользователя — UI прячет недоступное по нему',
  })
  @ApiHeader({ name: 'X-Tenant-Slug', required: true })
  @ApiQuery({ name: 'resource' })
  @ApiQuery({ name: 'action' })
  @ApiOkResponse({ description: '{level, canView, canEdit}' })
  async check(
    @Req() req: AuthenticatedRequest,
    @Query('resource') resource?: string,
    @Query('action') action?: string,
  ) {
    const slug = req.headers['x-tenant-slug'];
    if (!resource || !action) throw new BadRequestException('Нужны query resource и action');
    if (typeof slug !== 'string' || !slug) {
      throw new BadRequestException('Нужен заголовок X-Tenant-Slug');
    }
    const { level } = await this.rbacService.resolveAccess(req.user.sub, slug, {
      resource,
      action,
      level: 'view',
    });
    return { level, canView: level !== 'none', canEdit: level === 'edit' };
  }

  @Post('demo-edit')
  @UseGuards(PermissionGuard)
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({
    summary: 'Демонстрация enforcement (T-020): требует settings.edit — до первых доменных экранов',
  })
  @ApiHeader({ name: 'X-Tenant-Slug', required: true })
  demoEdit() {
    return { ok: true };
  }

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
