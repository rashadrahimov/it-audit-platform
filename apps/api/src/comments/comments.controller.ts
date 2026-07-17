import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
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
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { AuditLogService } from '../audit/audit-log.service';
import { DbService } from '../db/db.service';
import { comment } from '../db/schema';

const createCommentSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.uuid(),
  body: z.string().min(1).max(10_000),
});

/** Комментарии полиморфны (T-023); право — по ресурсу finding как самому «комментируемому» до granular-модели. */
@Controller('comments')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class CommentsController {
  constructor(
    private readonly dbService: DbService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Post()
  @RequirePermission('finding', 'view')
  @ApiOperation({ summary: 'Добавить комментарий к сущности (T-023)' })
  @ApiCreatedResponse({ description: 'Комментарий создан' })
  async create(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createCommentSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const created = await this.dbService.withTenant(req.tenantId, async (tx) => {
      const [row] = await tx
        .insert(comment)
        .values({ tenantId: req.tenantId, authorUserId: req.user.sub, ...parsed.data })
        .returning();
      return row;
    });
    await this.auditLogService.record({
      tenantId: req.tenantId,
      actorUserId: req.user.sub,
      actorIp: req.ip,
      action: 'comment.created',
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
      after: created,
    });
    return created;
  }

  @Get()
  @RequirePermission('finding', 'view')
  @ApiOperation({ summary: 'Комментарии сущности (без soft-deleted)' })
  @ApiOkResponse({ description: 'Список комментариев' })
  async list(
    @Req() req: TenantRequest,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
  ) {
    if (!entityType || !entityId) {
      throw new BadRequestException('Нужны query entityType и entityId');
    }
    return this.dbService.withTenant(req.tenantId, (tx) =>
      tx
        .select()
        .from(comment)
        .where(
          and(
            eq(comment.entityType, entityType),
            eq(comment.entityId, entityId),
            isNull(comment.deletedAt),
          ),
        )
        .orderBy(comment.createdAt),
    );
  }
}
