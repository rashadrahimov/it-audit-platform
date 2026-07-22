import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiHeader, ApiOperation } from '@nestjs/swagger';
import { i18nTextSchema } from '@it-audit/shared';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { ENTITY_KINDS, UniverseService } from './universe.service';

const createSchema = z.object({
  kind: z.enum(ENTITY_KINDS),
  nameI18n: i18nTextSchema,
  parentId: z.uuid().optional(),
  descriptionI18n: i18nTextSchema.optional(),
  ownerMembershipId: z.uuid().optional(),
  refId: z.uuid().optional(),
  custom: z.record(z.string(), z.unknown()).optional(),
});

const moveSchema = z.object({ parentId: z.uuid().nullable() });
const updateSchema = z
  .object({
    kind: z.enum(ENTITY_KINDS).optional(),
    nameI18n: i18nTextSchema.optional(),
    descriptionI18n: i18nTextSchema.nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Нужно передать хотя бы одно поле',
  });

@Controller('universe')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class UniverseController {
  constructor(private readonly service: UniverseService) {}

  @Post()
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Создать узел audit universe (T-065, UNI-01)' })
  @ApiCreatedResponse({ description: 'Узел дерева' })
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.create(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Post(':id/move')
  @HttpCode(200)
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Переместить узел (смена parent, защита от цикла)' })
  move(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = moveSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.move(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data.parentId,
    );
  }

  @Patch(':id')
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Изменить узел audit universe (T-H130)' })
  update(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = updateSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.update(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data,
    );
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Архивировать листовой узел audit universe (T-H130)' })
  async remove(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    await this.service.remove({ tenantId: req.tenantId, userId: req.user.sub, ip: req.ip }, id);
  }

  @Get()
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Плоский список узлов (клиент строит дерево)' })
  list(@Req() req: TenantRequest) {
    return this.service.list(req.tenantId);
  }

  @Get(':id')
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Узел + дети + permanent-документы' })
  get(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(req.tenantId, id);
  }
}
