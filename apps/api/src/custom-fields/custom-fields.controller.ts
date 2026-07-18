import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
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
import { i18nTextSchema } from '@it-audit/shared';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { CustomFieldsService, FIELD_TYPES } from './custom-fields.service';

const defineSchema = z.object({
  entityType: z.string().min(1),
  key: z
    .string()
    .min(1)
    .regex(/^[a-z0-9_]+$/, 'key: только a-z0-9_'),
  labelI18n: i18nTextSchema,
  fieldType: z.enum(FIELD_TYPES),
  options: z.array(z.string()).optional(),
  required: z.boolean().optional(),
});

const validateSchema = z.object({
  entityType: z.string().min(1),
  values: z.record(z.string(), z.unknown()),
});

@Controller('custom-fields')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class CustomFieldsController {
  constructor(private readonly service: CustomFieldsService) {}

  @Post()
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'Определить custom-поле для entity_type (T-086, GEN-07)' })
  @ApiCreatedResponse({ description: '{id, key}' })
  define(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = defineSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.define(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Get()
  @RequirePermission('settings', 'view')
  @ApiOperation({ summary: 'Определения custom-полей entity_type' })
  @ApiQuery({ name: 'entityType', required: true })
  list(@Req() req: TenantRequest, @Query('entityType') entityType?: string) {
    if (!entityType) throw new BadRequestException('Нужен entityType');
    return this.service.listFor(req.tenantId, entityType);
  }

  @Post('validate')
  @HttpCode(200)
  @RequirePermission('settings', 'view')
  @ApiOperation({ summary: 'Проверить payload значений по определениям (тип/required/select)' })
  validate(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = validateSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.validate(req.tenantId, parsed.data.entityType, parsed.data.values);
  }
}
