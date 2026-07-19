import { BadRequestException, Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { DEFAULT_LOCALE, localeSchema, type Locale } from '@it-audit/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { MyWorkService } from './my-work.service';

function parseLocale(localeQuery?: string): Locale {
  if (localeQuery === undefined) return DEFAULT_LOCALE;
  const parsed = localeSchema.safeParse(localeQuery);
  if (!parsed.success) throw new BadRequestException('locale: ожидается en|az|ru');
  return parsed.data;
}

@Controller('my-work')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class MyWorkController {
  constructor(private readonly service: MyWorkService) {}

  @Get()
  // engagement.view — есть у всех аудит-ролей включая Collaborator
  @RequirePermission('engagement', 'view')
  @ApiOperation({ summary: 'T-V18: агрегат «назначено мне» (My work)' })
  @ApiQuery({ name: 'locale', required: false })
  @ApiOkResponse({
    description: '{findings, tests, policiesToApprove, attestationsPending, accessRequests}',
  })
  summary(@Req() req: TenantRequest, @Query('locale') localeQuery?: string) {
    return this.service.summary(req.user.sub, req.tenantId, parseLocale(localeQuery));
  }
}
