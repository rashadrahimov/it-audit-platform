import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiHeader, ApiOperation } from '@nestjs/swagger';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { SatisfactionService } from './satisfaction.service';

const submitSchema = z.object({
  engagementId: z.uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
});

@Controller('satisfaction-surveys')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class SatisfactionController {
  constructor(private readonly service: SatisfactionService) {}

  @Post()
  @RequirePermission('engagement', 'view')
  @ApiOperation({ summary: 'Оценка удовлетворённости аудитом 1-5 (T-097, ISS-06)' })
  @ApiCreatedResponse({ description: '{id, rating}' })
  submit(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = submitSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.submit(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Get('summary/:engagementId')
  @RequirePermission('engagement', 'view')
  @ApiOperation({ summary: 'Средний рейтинг по engagement' })
  summary(@Req() req: TenantRequest, @Param('engagementId', ParseUUIDPipe) engagementId: string) {
    return this.service.summary(req.tenantId, engagementId);
  }
}
