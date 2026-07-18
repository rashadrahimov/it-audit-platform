import {
  BadRequestException,
  Body,
  Controller,
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
import { i18nTextSchema } from '@it-audit/shared';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { AuditProgramsService } from './audit-programs.service';

const stepSchema = z.object({
  titleI18n: i18nTextSchema,
  instructionsI18n: i18nTextSchema.optional(),
  order: z.number().int().optional(),
});

const createSchema = z.object({
  titleI18n: i18nTextSchema,
  engagementId: z.uuid().optional(),
  subjectArea: z.string().optional(),
  steps: z.array(stepSchema).optional(),
});

@Controller('audit-programs')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class AuditProgramsController {
  constructor(private readonly service: AuditProgramsService) {}

  @Post()
  @RequirePermission('engagement', 'edit', 'edit')
  @ApiOperation({ summary: 'Создать audit program с шагами (T-093, ENG-04)' })
  @ApiCreatedResponse({ description: '{id, steps}' })
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.create(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Post(':id/roll-forward')
  @HttpCode(200)
  @RequirePermission('engagement', 'edit', 'edit')
  @ApiOperation({ summary: 'Roll-forward программы в новый engagement (T-093, ENG-05)' })
  rollForward(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = z.object({ targetEngagementId: z.uuid() }).safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.rollForward(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data.targetEngagementId,
    );
  }

  @Get()
  @RequirePermission('engagement', 'view')
  @ApiOperation({ summary: 'Audit programs (?engagementId — фильтр)' })
  @ApiQuery({ name: 'engagementId', required: false })
  list(@Req() req: TenantRequest, @Query('engagementId') engagementId?: string) {
    return this.service.list(req.tenantId, engagementId);
  }

  @Get(':id')
  @RequirePermission('engagement', 'view')
  @ApiOperation({ summary: 'Программа + шаги' })
  get(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(req.tenantId, id);
  }
}
