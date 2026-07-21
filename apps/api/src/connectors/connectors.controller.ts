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
import { CAPABILITIES, ConnectorsService } from './connectors.service';
import { ConnectorSyncService } from './connector-sync.service';

const createConnectorSchema = z.object({
  provider: z.string().min(1),
  capabilities: z.array(z.enum(CAPABILITIES as [string, ...string[]])).min(1),
  config: z.record(z.string(), z.unknown()).default({}),
});

const updateConnectorSchema = z
  .object({
    capabilities: z
      .array(z.enum(CAPABILITIES as [string, ...string[]]))
      .min(1)
      .optional(),
    config: z.record(z.string(), z.unknown()).optional(),
    status: z.enum(['active', 'disabled']).optional(),
    syncIntervalMinutes: z.number().int().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Пустой patch' });

@Controller('connectors')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class ConnectorsController {
  constructor(
    private readonly connectorsService: ConnectorsService,
    private readonly connectorSyncService: ConnectorSyncService,
  ) {}

  @Post()
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Создать коннектор (T-048): конфиг шифруется, наружу не отдаётся' })
  @ApiCreatedResponse({ description: 'Коннектор без секретов (hasConfig=true)' })
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createConnectorSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.connectorsService.create(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Get()
  @RequirePermission('settings', 'view')
  @ApiOperation({ summary: 'Коннекторы тенанта (без секретов)' })
  @ApiOkResponse({ description: '[{id, provider, capabilities, status, hasConfig, lastSyncAt}]' })
  list(@Req() req: TenantRequest) {
    return this.connectorsService.list(req.tenantId);
  }

  @Get('catalog')
  @RequirePermission('settings', 'view')
  @ApiOperation({ summary: 'T-V38: каталог провайдеров — метаданные и поля конфига для формы' })
  @ApiOkResponse({ description: '[{provider, label, description, capabilities, configFields}]' })
  catalog() {
    return this.connectorSyncService.catalog();
  }

  @Get('monitoring-summary')
  @RequirePermission('settings', 'view')
  @ApiOperation({
    summary: 'T-H43: continuous monitoring/rescan summary по коннекторам и автотестам',
  })
  @ApiOkResponse({
    description:
      '{counts, scheduler, lastSyncAt, lastAutoTestAt, connectors[], recentRuns[]} без секретов',
  })
  monitoringSummary(@Req() req: TenantRequest) {
    return this.connectorsService.monitoringSummary(req.tenantId);
  }

  @Get(':id')
  @RequirePermission('settings', 'view')
  @ApiOperation({ summary: 'Карточка коннектора + история sync_run' })
  detail(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.connectorsService.detail(req.tenantId, id);
  }

  @Patch(':id')
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({
    summary: 'T-V38: обновить коннектор — capabilities/config(merge)/статус/расписание автосинка',
  })
  @ApiOkResponse({ description: 'Коннектор без секретов' })
  update(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = updateConnectorSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.connectorsService.update(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data,
    );
  }

  @Post(':id/sync')
  @HttpCode(200)
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({
    summary: 'Запустить синхронизацию (T-049): пишет sync_run; сбой → outcome=error',
  })
  @ApiOkResponse({ description: 'Результат прогона {outcome, stats, error}' })
  sync(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.connectorSyncService.run(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
    );
  }

  @Post(':id/test')
  @HttpCode(200)
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({
    summary: 'T-V38: тест соединения — bind/probe без записи sync_run; всегда {ok, message}',
  })
  @ApiOkResponse({ description: '{ok: boolean, message: string}' })
  test(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.connectorSyncService.testConnection(req.tenantId, id);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Удалить коннектор (soft-delete)' })
  async remove(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.connectorsService.remove(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
    );
  }
}
