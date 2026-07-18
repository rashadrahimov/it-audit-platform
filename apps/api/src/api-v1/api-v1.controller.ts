import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiSecurity } from '@nestjs/swagger';
import { isNull } from 'drizzle-orm';
import { resolveLocalized } from '@it-audit/shared';
import { ApiKeyGuard, type ApiKeyRequest } from '../api-keys/api-key.guard';
import { control } from '../db/schema';
import { DbService } from '../db/db.service';

/** Публичный версионированный REST API (T-091, EP-API, INT-01): аутентификация API-ключом. */
@Controller('api/v1')
@UseGuards(ApiKeyGuard)
@ApiSecurity('api-key')
export class ApiV1Controller {
  constructor(private readonly dbService: DbService) {}

  @Get('controls')
  @ApiOperation({ summary: 'Контроли тенанта (программный доступ по X-Api-Key)' })
  @ApiOkResponse({ description: '[{id, ref, objective}]' })
  async controls(@Req() req: ApiKeyRequest) {
    const rows = await this.dbService.withTenant(req.tenantId, (tx) =>
      tx
        .select({ id: control.id, ref: control.ref, objectiveI18n: control.objectiveI18n })
        .from(control)
        .where(isNull(control.deletedAt)),
    );
    return rows.map((c) => ({ id: c.id, ref: c.ref, objective: resolveLocalized(c.objectiveI18n, 'en') }));
  }
}
