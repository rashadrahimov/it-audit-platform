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
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { evidenceReviewStatusSchema } from '@it-audit/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { filterParam, uuidFilterParam } from '../list-filters';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { DocumentsService } from './documents.service';

const MAX_FILE_SIZE = 25 * 1024 * 1024;

const linkSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.uuid(),
  relation: z.string().min(1).default('evidence'),
});

const requestSchema = z.object({
  filename: z.string().min(1).max(300),
  category: z.string().max(100).optional(),
  renewBy: z.string().optional(),
  entityType: z.string().min(1).optional(),
  entityId: z.uuid().optional(),
  relation: z.string().min(1).optional(),
});
const reviewSchema = z.object({ reviewStatus: evidenceReviewStatusSchema });

@Controller('documents')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  // под view-правом: evidence прикладывают и респонденты (Collaborator, как T-037)
  @RequirePermission('engagement', 'view')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  @ApiOperation({ summary: 'Документ-доказательство (T-034): multipart + опциональная привязка' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        renewBy: { type: 'string', description: 'ISO-дата обновления доказательства (cadence)' },
        category: { type: 'string', description: 'Категория документа (T-V02)' },
        status: { type: 'string', description: 'draft|active (T-V02); по умолчанию active' },
        supersedesId: {
          type: 'string',
          description: 'T-V02: закрыть needs_document или загрузить новую версию документа',
        },
        entityType: { type: 'string', description: 'Сразу привязать: response/framework/…' },
        entityId: { type: 'string' },
        relation: { type: 'string', description: 'evidence|permanent_file|attachment|report' },
      },
    },
  })
  @ApiCreatedResponse({ description: 'Метаданные документа' })
  upload(
    @Req() req: TenantRequest,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: Record<string, string | undefined>,
  ) {
    if (!file) throw new BadRequestException('Нужен multipart-файл в поле «file»');
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    let link;
    if (body.entityType || body.entityId) {
      const parsed = linkSchema.safeParse({
        entityType: body.entityType,
        entityId: body.entityId,
        relation: body.relation || 'evidence',
      });
      if (!parsed.success) throw new BadRequestException(parsed.error.issues);
      link = parsed.data;
    }
    const status =
      body.status === 'draft' ? 'draft' : body.status === 'active' ? 'active' : undefined;
    return this.documentsService.upload(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      { buffer: file.buffer, originalName, mime: file.mimetype },
      {
        renewBy: body.renewBy,
        category: body.category,
        status,
        supersedesId: body.supersedesId,
        link,
      },
    );
  }

  @Post('request')
  @RequirePermission('engagement', 'view')
  @ApiOperation({ summary: 'T-V02: запросить доказательство (needs_document без файла)' })
  @ApiCreatedResponse({ description: 'Плейсхолдер документа' })
  requestDocument(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = requestSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const { filename, category, renewBy, entityType, entityId, relation } = parsed.data;
    let link;
    if (entityType || entityId) {
      const linkParsed = linkSchema.safeParse({
        entityType,
        entityId,
        relation: relation || 'evidence',
      });
      if (!linkParsed.success) throw new BadRequestException(linkParsed.error.issues);
      link = linkParsed.data;
    }
    return this.documentsService.requestDocument(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      { filename, category, renewBy, link },
    );
  }

  @Post(':id/publish')
  @HttpCode(200)
  @RequirePermission('engagement', 'view')
  @ApiOperation({ summary: 'T-V02: опубликовать черновик документа (draft → active)' })
  publish(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.documentsService.publish(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
    );
  }

  @Post(':id/links')
  @RequirePermission('engagement', 'view')
  @ApiOperation({ summary: 'Привязать документ к сущности (evidence/маппинг на framework)' })
  @ApiCreatedResponse({ description: '{linked: bool} — false, если тройка уже существует' })
  addLink(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = linkSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.documentsService.addLink(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data,
    );
  }

  @Get('readiness-summary')
  @RequirePermission('engagement', 'view')
  @ApiOperation({
    summary: 'Сводка готовности документов-доказательств: покрытие, review, просрочки и gaps',
  })
  @ApiOkResponse({ description: '{totalDocuments, coveragePercent, topGaps, ...}' })
  readinessSummary(@Req() req: TenantRequest) {
    return this.documentsService.readinessSummary(req.tenantId);
  }

  @Get()
  @RequirePermission('engagement', 'view')
  @ApiOperation({
    summary:
      'Документы: с ?entityType&entityId — по привязкам; без — tenant-wide реестр (T-V01; фильтры ?status=, ?ownerMembershipId=)',
  })
  @ApiOkResponse({ description: '[{id, filename, owner, links, renewBy, status}]' })
  listFor(
    @Req() req: TenantRequest,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('status') status?: string,
    @Query('ownerMembershipId') ownerMembershipId?: string,
  ) {
    if (entityType || entityId) {
      if (!entityType || !entityId) {
        throw new BadRequestException('Нужны entityType и entityId вместе');
      }
      return this.documentsService.listFor(req.tenantId, req.user.sub, entityType, entityId);
    }
    return this.documentsService.listAll(req.tenantId, {
      status: filterParam(status, 'status'),
      ownerMembershipId: uuidFilterParam(ownerMembershipId, 'ownerMembershipId'),
    });
  }

  @Patch(':id')
  @RequirePermission('settings', 'edit', 'edit')
  @ApiOperation({ summary: 'T-V01: переназначить owner документа' })
  reassign(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = z.object({ ownerMembershipId: z.uuid() }).safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.documentsService.reassignOwner(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data.ownerMembershipId,
    );
  }

  @Patch('links/:linkId/review')
  @RequirePermission('engagement', 'view')
  @ApiOperation({
    summary: 'Review-статус доказательства аудитором (T-112, evidence tracker)',
  })
  @ApiOkResponse({ description: '{id, reviewStatus}' })
  setReviewStatus(
    @Req() req: TenantRequest,
    @Param('linkId', ParseUUIDPipe) linkId: string,
    @Body() body: unknown,
  ) {
    const parsed = reviewSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.documentsService.setReviewStatus(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      linkId,
      parsed.data.reviewStatus,
    );
  }

  @Get(':id/content')
  @RequirePermission('engagement', 'view')
  @ApiOperation({ summary: 'Скачать документ (авторизованно, метаданные под RLS)' })
  async content(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { filename, stored } = await this.documentsService.content(
      req.tenantId,
      req.user.sub,
      id,
    );
    res.setHeader('Content-Type', stored.contentType);
    if (stored.contentLength !== undefined) {
      res.setHeader('Content-Length', String(stored.contentLength));
    }
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    stored.body.pipe(res);
  }
}
