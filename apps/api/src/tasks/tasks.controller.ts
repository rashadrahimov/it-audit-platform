import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { z } from 'zod';
import { DEFAULT_LOCALE, localeSchema } from '@it-audit/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { TasksService } from './tasks.service';

const createSchema = z.object({
  entityType: z.enum(['engagement', 'finding', 'risk', 'control', 'vendor', 'policy', 'personnel']),
  entityId: z.uuid(),
  title: z.string().min(1).max(500),
  assigneeMembershipId: z.uuid().optional(),
  dueDate: z.iso.datetime().optional(),
});

const updateSchema = z.object({
  status: z.enum(['open', 'in_progress', 'done']).optional(),
  assigneeMembershipId: z.uuid().nullable().optional(),
  dueDate: z.iso.datetime().nullable().optional(),
});
const actionPlanSeedSchema = z.object({
  engagementId: z.uuid(),
  locale: localeSchema.default(DEFAULT_LOCALE),
});

// Задачи ремедиации — governance-домен, право 'control' (соседствует с findings/risks).
@Controller('tasks')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class TasksController {
  constructor(private readonly service: TasksService) {}

  @Get('recommendation-templates')
  @RequirePermission('control', 'view')
  @ApiOperation({
    summary: 'T-H73: reusable recommendation templates for Action Plan remediation',
  })
  recommendationTemplates(@Query('locale') localeQuery?: string) {
    const parsed = localeSchema.safeParse(localeQuery ?? DEFAULT_LOCALE);
    if (!parsed.success) throw new BadRequestException('locale: ожидается en|az|ru');
    return this.service.recommendationTemplates(parsed.data);
  }

  @Get()
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Задачи сущности (T-V27): ?entityType=&entityId=' })
  @ApiQuery({ name: 'entityType', required: true })
  @ApiQuery({ name: 'entityId', required: true })
  list(
    @Req() req: TenantRequest,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('locale') localeQuery?: string,
  ) {
    if (!entityType || !entityId) throw new BadRequestException('Нужны entityType и entityId');
    const parsed = localeSchema.safeParse(localeQuery ?? DEFAULT_LOCALE);
    if (!parsed.success) throw new BadRequestException('locale: ожидается en|az|ru');
    return this.service.list(req.tenantId, entityType, entityId, parsed.data);
  }

  @Post()
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Создать задачу ремедиации (T-V27)' })
  @ApiCreatedResponse({ description: '{id, status}' })
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.create(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Post('action-plan/from-findings')
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({
    summary: 'T-H35: создать Action Plan tasks из recommendations findings engagement',
  })
  seedActionPlan(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = actionPlanSeedSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.seedActionPlanFromFindings(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Patch(':id')
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Обновить задачу (T-V27): статус/assignee/due; done→completed_at' })
  update(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = updateSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    if (Object.keys(parsed.data).length === 0) {
      throw new BadRequestException('Нужно хотя бы одно поле');
    }
    return this.service.update(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data,
    );
  }

  @Delete(':id')
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Удалить задачу (T-V27)' })
  remove(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove({ tenantId: req.tenantId, userId: req.user.sub, ip: req.ip }, id);
  }
}
