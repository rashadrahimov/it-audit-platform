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
import { DEFAULT_LOCALE, i18nTextSchema, localeSchema, type Locale } from '@it-audit/shared';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { GlossaryService } from './glossary.service';

const createSchema = z.object({
  term: z.string().trim().min(1).max(160),
  definitionI18n: i18nTextSchema,
  category: z.string().trim().max(120).optional(),
});
const updateSchema = createSchema.partial().refine((body) => Object.keys(body).length > 0, {
  message: 'Нужно передать хотя бы одно поле',
});

function parseLocale(localeQuery?: string): Locale {
  if (localeQuery === undefined) return DEFAULT_LOCALE;
  const parsed = localeSchema.safeParse(localeQuery);
  if (!parsed.success) throw new BadRequestException('locale: ожидается en|az|ru');
  return parsed.data;
}

@Controller('glossary')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class GlossaryController {
  constructor(private readonly service: GlossaryService) {}

  @Get()
  @RequirePermission('engagement', 'view')
  @ApiOperation({ summary: 'Глоссарий (global + кастомные, ?q поиск, T-095, GEN-09)' })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'locale', required: false })
  list(@Req() req: TenantRequest, @Query('q') q?: string, @Query('locale') localeQuery?: string) {
    return this.service.list(req.tenantId, parseLocale(localeQuery), q);
  }

  @Post()
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Завести кастомный термин тенанта' })
  @ApiCreatedResponse({ description: '{id, term}' })
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.create(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Patch(':id')
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Изменить кастомный термин тенанта' })
  update(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = updateSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.update(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data,
    );
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Удалить кастомный термин тенанта' })
  async remove(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    await this.service.remove({ tenantId: req.tenantId, userId: req.user.sub, ip: req.ip }, id);
  }
}
