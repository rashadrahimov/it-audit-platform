import { Controller, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { UsersService } from './users.service';

/** Админ-операции над аккаунтами. settings.edit — прокси админ-права до расширения каталога ресурсов. */
@Controller('users')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post(':id/deactivate')
  @HttpCode(204)
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Offboarding: деактивировать аккаунт (T-017)' })
  async deactivate(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.usersService.deactivate(id);
  }

  @Post(':id/reactivate')
  @HttpCode(204)
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Вернуть доступ деактивированному аккаунту' })
  async reactivate(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.usersService.reactivate(id);
  }
}
