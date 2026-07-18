import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { i18nTextSchema } from '@it-audit/shared';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { ConfigListsService } from './config-lists.service';

const setSchema = z.object({
  items: z.array(z.object({ code: z.string().min(1), labelI18n: i18nTextSchema })).min(1),
});

@Controller('config-lists')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class ConfigListsController {
  constructor(private readonly service: ConfigListsService) {}

  @Get(':listKey')
  @RequirePermission('settings', 'view')
  @ApiOperation({ summary: 'Настраиваемый список (T-087): переопределение тенанта или дефолт' })
  @ApiOkResponse({ description: '{listKey, items:[{code, labelI18n}], isDefault}' })
  get(@Req() req: TenantRequest, @Param('listKey') listKey: string) {
    return this.service.get(req.tenantId, listKey);
  }

  @Put(':listKey')
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Переопределить список тенанта' })
  set(@Req() req: TenantRequest, @Param('listKey') listKey: string, @Body() body: unknown) {
    const parsed = setSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.set(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      listKey,
      parsed.data.items,
    );
  }

  @Get(':listKey/history')
  @RequirePermission('settings', 'view')
  @ApiOperation({ summary: 'История версий списка (TEC-03): снимки прошлых items' })
  @ApiOkResponse({ description: '{listKey, versions:[{items, at, by}]}' })
  history(@Req() req: TenantRequest, @Param('listKey') listKey: string) {
    return this.service.getHistory(req.tenantId, listKey);
  }

  @Get(':listKey/validate')
  @RequirePermission('settings', 'view')
  @ApiOperation({ summary: 'Проверить значение по списку (?code)' })
  @ApiQuery({ name: 'code', required: true })
  validate(
    @Req() req: TenantRequest,
    @Param('listKey') listKey: string,
    @Query('code') code?: string,
  ) {
    if (!code) throw new BadRequestException('Нужен code');
    return this.service.validateValue(req.tenantId, listKey, code);
  }
}
