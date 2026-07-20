import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
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
import { auditorVerdictSchema } from '@it-audit/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { AuditorAssessmentsService } from './auditor-assessments.service';

const createSchema = z.object({
  targetType: z.enum(['checklist_item', 'finding']),
  targetId: z.uuid(),
  verdict: auditorVerdictSchema,
  note: z.string().optional(),
});

@Controller('auditor-assessments')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class AuditorAssessmentsController {
  constructor(private readonly service: AuditorAssessmentsService) {}

  @Post()
  @RequirePermission('engagement', 'view')
  @ApiOperation({ summary: 'Оценка аудитора по пункту аудита (T-113, новый раунд)' })
  @ApiCreatedResponse({ description: '{id, round, verdict}' })
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.create(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Get()
  @RequirePermission('engagement', 'view')
  @ApiOperation({ summary: 'История раундов оценок аудитора по цели' })
  @ApiOkResponse({ description: '[{id, round, verdict, note, assessor, createdAt}]' })
  listFor(
    @Req() req: TenantRequest,
    @Query('targetType') targetType?: string,
    @Query('targetId') targetId?: string,
  ) {
    if (!targetType || !targetId) throw new BadRequestException('Нужны targetType и targetId');
    return this.service.listFor(req.tenantId, targetType, targetId);
  }
}
