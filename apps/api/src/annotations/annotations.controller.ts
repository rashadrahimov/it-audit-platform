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
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { AnnotationsService } from './annotations.service';

const createSchema = z.object({
  workingPaperId: z.uuid(),
  kind: z.enum(['comment', 'tick_mark', 'exception']).default('comment'),
  anchor: z.string().optional(),
  body: z.string().min(1),
});

@Controller('annotations')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class AnnotationsController {
  constructor(private readonly service: AnnotationsService) {}

  @Post()
  @RequirePermission('engagement', 'edit', 'edit')
  @ApiOperation({ summary: 'Аннотация рабочего документа (WP-06/WP-09, T-H19)' })
  @ApiCreatedResponse({ description: '{id}' })
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.create(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Get()
  @RequirePermission('engagement', 'view')
  @ApiOperation({ summary: 'Аннотации рабочего документа (?workingPaperId)' })
  @ApiQuery({ name: 'workingPaperId', required: true })
  list(@Req() req: TenantRequest, @Query('workingPaperId') workingPaperId?: string) {
    if (!workingPaperId) throw new BadRequestException('Нужен workingPaperId');
    return this.service.list(req.tenantId, workingPaperId);
  }

  @Post(':id/resolve')
  @HttpCode(200)
  @RequirePermission('engagement', 'edit', 'edit')
  @ApiOperation({ summary: 'Отметить аннотацию решённой' })
  resolve(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.resolve({ tenantId: req.tenantId, userId: req.user.sub, ip: req.ip }, id);
  }

  @Delete(':id')
  @RequirePermission('engagement', 'edit', 'edit')
  @ApiOperation({ summary: 'Удалить аннотацию' })
  remove(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove({ tenantId: req.tenantId, userId: req.user.sub, ip: req.ip }, id);
  }
}
