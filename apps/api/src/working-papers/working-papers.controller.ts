import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiHeader, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { WorkingPapersService } from './working-papers.service';

const createSchema = z.object({
  engagementId: z.uuid(),
  title: z.string().min(1),
  content: z.unknown().optional(),
});

@Controller('working-papers')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class WorkingPapersController {
  constructor(private readonly service: WorkingPapersService) {}

  @Post()
  @RequirePermission('engagement', 'edit', 'edit')
  @ApiOperation({ summary: 'Создать working paper (T-092, WP-02)' })
  @ApiCreatedResponse({ description: '{id, status}' })
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.create(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Put(':id/content')
  @RequirePermission('engagement', 'edit', 'edit')
  @ApiOperation({ summary: 'Правка content (после reviewed → edited_since_review, WP-08)' })
  editContent(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = z.object({ content: z.unknown() }).safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.editContent(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data.content,
    );
  }

  @Post(':id/transition')
  @HttpCode(200)
  @RequirePermission('engagement', 'edit', 'edit')
  @ApiOperation({ summary: 'WP workflow: draft→prepared→in_review→reviewed→signed_off' })
  transition(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = z
      .object({ to: z.enum(['prepared', 'in_review', 'reviewed', 'signed_off']) })
      .safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.transition(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data.to,
    );
  }

  @Get()
  @RequirePermission('engagement', 'view')
  @ApiOperation({ summary: 'Working papers engagement (?engagementId)' })
  @ApiQuery({ name: 'engagementId', required: true })
  list(@Req() req: TenantRequest, @Query('engagementId') engagementId?: string) {
    if (!engagementId) throw new BadRequestException('Нужен engagementId');
    return this.service.list(req.tenantId, engagementId);
  }

  @Get(':id')
  @RequirePermission('engagement', 'view')
  @ApiOperation({ summary: 'WP + подписи' })
  get(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(req.tenantId, id);
  }
}
