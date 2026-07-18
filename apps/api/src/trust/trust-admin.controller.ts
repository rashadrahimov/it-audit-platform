import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation } from '@nestjs/swagger';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { TrustService } from './trust.service';

const configureSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'slug: только a-z0-9-'),
  title: z.string().min(1),
  intro: z.string().optional(),
  isPublic: z.boolean().optional(),
});

const itemSchema = z.object({
  label: z.string().min(1),
  category: z.enum(['framework', 'control', 'document', 'other']),
  published: z.boolean().optional(),
});

@Controller('trust-center')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class TrustAdminController {
  constructor(private readonly service: TrustService) {}

  @Post()
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Настроить Trust Center (T-080, B7)' })
  configure(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = configureSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.configure(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Post('items')
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Опубликовать элемент постуры' })
  addItem(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = itemSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.addItem(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Get()
  @RequirePermission('settings', 'view')
  @ApiOperation({ summary: 'Админ-вид Trust Center (все items)' })
  adminGet(@Req() req: TenantRequest) {
    return this.service.adminGet(req.tenantId);
  }
}
