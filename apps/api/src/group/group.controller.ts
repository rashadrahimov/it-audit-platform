import { BadRequestException, Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { DEFAULT_LOCALE, localeSchema } from '@it-audit/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { GroupService } from './group.service';

@Controller('group')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  @Get('summary')
  @RequirePermission('report', 'view')
  @ApiOperation({
    summary: 'Групповой агрегат (T-012): по группе и дочкам; subsidiary_scope режет видимость',
  })
  @ApiQuery({ name: 'locale', required: false })
  @ApiOkResponse({ description: '{scope, group: {…counts}, subsidiaries: [{id, name, …counts}]}' })
  summary(@Req() req: TenantRequest, @Query('locale') localeQuery?: string) {
    let locale = DEFAULT_LOCALE;
    if (localeQuery !== undefined) {
      const parsed = localeSchema.safeParse(localeQuery);
      if (!parsed.success) throw new BadRequestException('locale: ожидается en|az|ru');
      locale = parsed.data;
    }
    return this.groupService.summary(req.tenantId, req.user.sub, locale);
  }
}
