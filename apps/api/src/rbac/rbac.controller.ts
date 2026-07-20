import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { z } from 'zod';
import { i18nTextSchema, type PermissionDto, type RoleWithMatrix } from '@it-audit/shared';
import { JwtAuthGuard, type AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from './permission.guard';
import { RequirePermission } from './require-permission.decorator';
import { RbacService } from './rbac.service';

const createRoleSchema = z.object({ nameI18n: i18nTextSchema });
const setCellSchema = z.object({
  resource: z.string().min(1),
  action: z.string().min(1),
  level: z.enum(['none', 'view', 'edit']),
});

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

  @Post('roles')
  @UseGuards(PermissionGuard)
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'T-V05: создать кастомную роль тенанта' })
  @ApiHeader({ name: 'X-Tenant-Slug', required: true })
  createRole(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createRoleSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.rbacService.createRole(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data.nameI18n,
    );
  }

  @Patch('roles/:id/cells')
  @UseGuards(PermissionGuard)
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'T-V05: выставить ячейку матрицы (только кастомные роли)' })
  @ApiHeader({ name: 'X-Tenant-Slug', required: true })
  setCell(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = setCellSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.rbacService.setCell(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data.resource,
      parsed.data.action,
      parsed.data.level,
    );
  }
}
