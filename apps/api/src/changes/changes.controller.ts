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
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { filterParam } from '../list-filters';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { ChangesService } from './changes.service';

const createSchema = z.object({
  title: z.string().min(1),
  type: z.string().optional(),
  risk: z.enum(['low', 'medium', 'high']).optional(),
  assetId: z.uuid().optional(),
  approverMembershipId: z.uuid().optional(),
});

@Controller('changes')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class ChangesController {
  constructor(private readonly service: ChangesService) {}

  @Post()
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Создать изменение (T-063, B13)' })
  @ApiCreatedResponse({ description: 'Изменение в статусе requested' })
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.create(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Post(':id/transition')
  @HttpCode(200)
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Workflow (T-063): approve/reject (approver)/deployed' })
  transition(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = z
      .object({ to: z.enum(['approved', 'rejected', 'deployed']) })
      .safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.transition(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data.to,
    );
  }

  @Get()
  @RequirePermission('control', 'view')
  @ApiOperation({
    summary: 'Изменения тенанта; фильтры: ?status=, ?type=, ?assetId= (T-V16/T-V40)',
  })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'assetId', required: false })
  list(
    @Req() req: TenantRequest,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('assetId') assetId?: string,
  ) {
    return this.service.list(req.tenantId, {
      status: filterParam(status, 'status'),
      type: filterParam(type, 'type'),
      assetId: filterParam(assetId, 'assetId'),
    });
  }
}
