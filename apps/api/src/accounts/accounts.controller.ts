import {
  BadRequestException,
  Body,
  Controller,
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
import { AccountsService } from './accounts.service';

const createAccountSchema = z.object({
  identifier: z.string().min(1),
  displayName: z.string().optional(),
  type: z.enum(['human', 'service']).optional(),
  mfaEnabled: z.boolean().optional(),
});

// IAM — governance-домен; право settings (как connectors/policies).
@Controller('accounts')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post('import')
  @HttpCode(200)
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Импорт аккаунтов из коннектора (T-054): personnel-records → accounts' })
  @ApiOkResponse({ description: '{imported}' })
  import(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = z.object({ connectorId: z.uuid() }).safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.accountsService.importFromConnector(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data.connectorId,
    );
  }

  @Post()
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Завести аккаунт вручную (T-054)' })
  @ApiCreatedResponse({ description: 'Аккаунт' })
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createAccountSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.accountsService.createManual(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Get()
  @RequirePermission('settings', 'view')
  @ApiOperation({ summary: 'Аккаунты тенанта' })
  @ApiOkResponse({ description: '[{id, identifier, displayName, type, mfaEnabled, status}]' })
  list(@Req() req: TenantRequest) {
    return this.accountsService.list(req.tenantId);
  }

  @Patch(':id')
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'T-V07: назначить owner аккаунта' })
  setOwner(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = z.object({ ownerMembershipId: z.uuid() }).safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.accountsService.setOwner(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data.ownerMembershipId,
    );
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Деактивировать аккаунт (T-054; deprovisioning — T-056)' })
  deactivate(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.accountsService.deactivate(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
    );
  }
}
