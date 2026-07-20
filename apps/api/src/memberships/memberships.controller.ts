import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { z } from 'zod';
import { DEFAULT_LOCALE, localeSchema, type Locale } from '@it-audit/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { MembershipsService } from './memberships.service';

function parseLocale(localeQuery?: string): Locale {
  if (localeQuery === undefined) return DEFAULT_LOCALE;
  const parsed = localeSchema.safeParse(localeQuery);
  if (!parsed.success) throw new BadRequestException('locale: ожидается en|az|ru');
  return parsed.data;
}

const updateSchema = z
  .object({
    roleId: z.uuid().optional(),
    subsidiaryScope: z.array(z.uuid()).nullable().optional(),
    // T-110: окно доступа (ISO-время; null = снять границу).
    dataAccessFrom: z.iso.datetime({ offset: true }).nullable().optional(),
    dataAccessUntil: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .refine(
    (d) =>
      d.roleId !== undefined ||
      d.subsidiaryScope !== undefined ||
      d.dataAccessFrom !== undefined ||
      d.dataAccessUntil !== undefined,
    { message: 'Нужно указать roleId, subsidiaryScope и/или окно доступа' },
  );

const toDate = (v: string | null | undefined): Date | null | undefined =>
  v === undefined ? undefined : v === null ? null : new Date(v);

@Controller('memberships')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class MembershipsController {
  constructor(private readonly service: MembershipsService) {}

  @Get()
  @RequirePermission('settings', 'view')
  @ApiOperation({ summary: 'Участники тенанта (для селекторов аллокаций/владельцев, T-A23)' })
  @ApiQuery({ name: 'locale', required: false })
  list(@Req() req: TenantRequest, @Query('locale') localeQuery?: string) {
    return this.service.list(req.tenantId, parseLocale(localeQuery));
  }

  @Patch(':id')
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Сменить роль/scoped-доступ участника (T-109, grant access)' })
  @ApiOkResponse({ description: '{id, roleId, subsidiaryScope}' })
  update(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = updateSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.update({ tenantId: req.tenantId, userId: req.user.sub, ip: req.ip }, id, {
      roleId: parsed.data.roleId,
      subsidiaryScope: parsed.data.subsidiaryScope,
      dataAccessFrom: toDate(parsed.data.dataAccessFrom),
      dataAccessUntil: toDate(parsed.data.dataAccessUntil),
    });
  }

  @Delete(':id')
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Отозвать доступ участника (T-109, soft — status=revoked)' })
  @ApiOkResponse({ description: '{id, status}' })
  revoke(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.revoke({ tenantId: req.tenantId, userId: req.user.sub, ip: req.ip }, id);
  }
}
