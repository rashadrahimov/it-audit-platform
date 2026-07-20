import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { filterParam, uuidFilterParam } from '../list-filters';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { PersonnelService } from './personnel.service';

const importSchema = z.object({ connectorId: z.uuid() });

const createSchema = z.object({
  fullName: z.string().min(1),
  email: z.email().optional(),
  departmentId: z.uuid().optional(),
  membershipId: z.uuid().optional(),
  unit: z.string().optional(),
  position: z.string().optional(),
  employmentStatus: z.enum(['active', 'onboarding', 'offboarded']).optional(),
  certificates: z.array(z.unknown()).optional(),
  contacts: z.record(z.string(), z.unknown()).optional(),
});

@Controller('personnel')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class PersonnelController {
  constructor(private readonly service: PersonnelService) {}

  @Post('import')
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Импорт профилей из personnel-коннектора (T-069, B6)' })
  @ApiCreatedResponse({ description: '{imported, updated}' })
  importFromConnector(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = importSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.importFromConnector(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data.connectorId,
    );
  }

  @Post()
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Завести профиль вручную' })
  @ApiCreatedResponse({ description: '{id, employmentStatus}' })
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.createManual(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Post(':id/status')
  @HttpCode(200)
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Сменить статус занятости (onboarding/active/offboarded)' })
  setStatus(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = z
      .object({ status: z.enum(['active', 'onboarding', 'offboarded']) })
      .safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.setStatus(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data.status,
    );
  }

  @Get('departments')
  @RequirePermission('settings', 'view')
  @ApiOperation({ summary: 'Департаменты тенанта (T-V26, Groups): + счётчик людей' })
  listDepartments(@Req() req: TenantRequest) {
    return this.service.listDepartments(req.tenantId);
  }

  @Post('departments')
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Создать департамент (T-V26)' })
  createDepartment(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = z.object({ name: z.string().min(1).max(200) }).safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.createDepartment(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data.name.trim(),
    );
  }

  @Patch('departments/:id')
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Переименовать департамент (T-V26)' })
  renameDepartment(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = z.object({ name: z.string().min(1).max(200) }).safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.renameDepartment(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data.name.trim(),
    );
  }

  @Delete('departments/:id')
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Удалить департамент (T-V26): сотрудники отвязываются' })
  deleteDepartment(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteDepartment(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
    );
  }

  @Get()
  @RequirePermission('settings', 'view')
  @ApiOperation({
    summary: 'Профили персонала тенанта; фильтры: ?employmentStatus=, ?departmentId= (T-V16)',
  })
  @ApiQuery({ name: 'employmentStatus', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  list(
    @Req() req: TenantRequest,
    @Query('employmentStatus') employmentStatus?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.service.list(req.tenantId, req.user.sub, {
      employmentStatus: filterParam(employmentStatus, 'employmentStatus'),
      departmentId: uuidFilterParam(departmentId, 'departmentId'),
    });
  }
}
