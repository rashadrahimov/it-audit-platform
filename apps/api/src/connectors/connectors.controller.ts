import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import { CAPABILITIES, ConnectorsService } from './connectors.service';
import { ConnectorSyncService } from './connector-sync.service';

const createConnectorSchema = z.object({
  provider: z.string().min(1),
  capabilities: z.array(z.enum(CAPABILITIES as [string, ...string[]])).min(1),
  config: z.record(z.string(), z.unknown()).default({}),
});

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

  @Get(':id')
  @RequirePermission('settings', 'view')
  @ApiOperation({ summary: 'Карточка коннектора + история sync_run' })
  detail(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.connectorsService.detail(req.tenantId, id);
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
