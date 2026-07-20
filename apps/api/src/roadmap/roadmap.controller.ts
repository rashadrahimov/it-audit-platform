import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { z } from 'zod';
import { DEFAULT_LOCALE, localeSchema, type Locale } from '@it-audit/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { RoadmapService } from './roadmap.service';

function parseLocale(localeQuery?: string): Locale {
  if (localeQuery === undefined) return DEFAULT_LOCALE;
  const parsed = localeSchema.safeParse(localeQuery);
  if (!parsed.success) throw new BadRequestException('locale: ожидается en|az|ru');
  return parsed.data;
}

const targetSchema = z.object({ targetDate: z.string().nullable() });

@Controller('roadmap')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class RoadmapController {
  constructor(private readonly service: RoadmapService) {}

  @Get()
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Roadmap внедрения per-framework (T-V33): фазы, прогресс, target-дата' })
  @ApiQuery({ name: 'locale', required: false })
  roadmap(@Req() req: TenantRequest, @Query('locale') localeQuery?: string) {
    return this.service.roadmap(req.tenantId, parseLocale(localeQuery));
  }

  @Put(':activationId/target')
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Установить целевую дату audit-ready (T-V33)' })
  setTarget(
    @Req() req: TenantRequest,
    @Param('activationId', ParseUUIDPipe) activationId: string,
    @Body() body: unknown,
  ) {
    const parsed = targetSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.setTarget(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      activationId,
      parsed.data.targetDate,
    );
  }
}
