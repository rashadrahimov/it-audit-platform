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
import { ApiBearerAuth, ApiHeader, ApiOperation } from '@nestjs/swagger';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { AccessRequestsService } from './access-requests.service';

@Controller()
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class AccessRequestsController {
  constructor(private readonly service: AccessRequestsService) {}

  // запрос доступа — self-service сотрудника (control.view, как attest)
  @Post('access-requests')
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Запросить доступ (T-056): approver-workflow' })
  request(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = z
      .object({
        system: z.string().min(1),
        justification: z.string().optional(),
        approverMembershipId: z.uuid().optional(),
      })
      .safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.request(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Post('access-requests/:id/decision')
  @HttpCode(200)
  @RequirePermission('settings', 'view')
  @ApiOperation({ summary: 'Решение по запросу (T-056): approve/reject' })
  decide(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = z.object({ decision: z.enum(['approve', 'reject']) }).safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.decide(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data.decision,
    );
  }

  @Get('access-requests')
  @RequirePermission('settings', 'view')
  @ApiOperation({ summary: 'Запросы доступа тенанта' })
  listRequests(@Req() req: TenantRequest) {
    return this.service.listRequests(req.tenantId);
  }

  @Post('deprovisioning-tasks')
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Создать deprovisioning-задачу (T-056): отзыв доступа' })
  createDeprovisioning(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = z
      .object({
        accountId: z.uuid(),
        reason: z.string().optional(),
        dueDate: z.iso.datetime().optional(),
      })
      .safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.createDeprovisioning(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Post('deprovisioning-tasks/:id/complete')
  @HttpCode(200)
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Закрыть deprovisioning-задачу (T-056): аккаунт деактивируется' })
  complete(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.completeDeprovisioning(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
    );
  }

  @Get('deprovisioning-tasks')
  @RequirePermission('settings', 'view')
  @ApiOperation({ summary: 'Открытые deprovisioning-задачи (со статусом SLA)' })
  listDeprovisioning(@Req() req: TenantRequest) {
    return this.service.listDeprovisioning(req.tenantId);
  }
}
