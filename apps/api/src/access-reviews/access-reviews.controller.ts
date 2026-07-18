import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { AccessReviewsService } from './access-reviews.service';

const createSchema = z.object({
  title: z.string().min(1),
  accountIds: z.array(z.uuid()).optional(),
  dueDate: z.iso.datetime().optional(),
});

@Controller('access-reviews')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class AccessReviewsController {
  constructor(private readonly service: AccessReviewsService) {}

  @Post()
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Создать UAR-кампанию (T-055): item на каждый аккаунт из scope' })
  @ApiCreatedResponse({ description: '{id, accounts, status}' })
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.create(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Post(':id/items/:itemId/decision')
  @HttpCode(200)
  @RequirePermission('settings', 'view')
  @ApiOperation({ summary: 'Решение reviewer (T-055): certify/revoke/modify; revoke деактивирует' })
  @ApiOkResponse({ description: '{decision, remaining}' })
  decide(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: unknown,
  ) {
    const parsed = z
      .object({ decision: z.enum(['certify', 'revoke', 'modify']) })
      .safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.decide(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      itemId,
      parsed.data.decision,
    );
  }

  @Get()
  @RequirePermission('settings', 'view')
  @ApiOperation({ summary: 'UAR-кампании тенанта' })
  list(@Req() req: TenantRequest) {
    return this.service.list(req.tenantId);
  }

  @Get(':id')
  @RequirePermission('settings', 'view')
  @ApiOperation({ summary: 'Кампания + пункты (аккаунты, решения)' })
  detail(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(req.tenantId, id);
  }
}
