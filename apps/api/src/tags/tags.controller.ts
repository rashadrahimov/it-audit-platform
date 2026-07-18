import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiHeader, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { TagsService } from './tags.service';

const createSchema = z.object({ name: z.string().min(1), color: z.string().optional() });
const linkSchema = z.object({ entityType: z.string().min(1), entityId: z.uuid() });

@Controller('tags')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class TagsController {
  constructor(private readonly service: TagsService) {}

  @Post()
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Создать тег (T-076)' })
  @ApiCreatedResponse({ description: '{id, name}' })
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.create(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Get()
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Теги тенанта' })
  list(@Req() req: TenantRequest) {
    return this.service.list(req.tenantId);
  }

  @Post(':id/attach')
  @HttpCode(200)
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Навесить тег на сущность (недопустимый entityType→400)' })
  attach(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = linkSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.attach(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data.entityType,
      parsed.data.entityId,
    );
  }

  @Delete(':id/attach')
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Снять тег с сущности' })
  detach(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = linkSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.detach(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data.entityType,
      parsed.data.entityId,
    );
  }

  @Get('of')
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Теги, навешенные на сущность' })
  @ApiQuery({ name: 'entityType', required: true })
  @ApiQuery({ name: 'entityId', required: true })
  tagsOf(
    @Req() req: TenantRequest,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
  ) {
    if (!entityType || !entityId) throw new BadRequestException('Нужны entityType и entityId');
    return this.service.tagsOf(req.tenantId, entityType, entityId);
  }
}
