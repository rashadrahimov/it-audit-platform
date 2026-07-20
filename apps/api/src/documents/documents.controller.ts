import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { DocumentsService } from './documents.service';

const MAX_FILE_SIZE = 25 * 1024 * 1024;

const linkSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.uuid(),
  relation: z.string().min(1).default('evidence'),
});

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
    return this.documentsService.upload(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      { buffer: file.buffer, originalName, mime: file.mimetype },
      { renewBy: body.renewBy, link },
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

  @Get()
  @RequirePermission('engagement', 'view')
  @ApiOperation({ summary: 'Документы сущности (по привязкам)' })
  @ApiOkResponse({ description: '[{id, filename, relation, sha256, renewBy, status}]' })
  listFor(
    @Req() req: TenantRequest,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
  ) {
    if (!entityType || !entityId) {
      throw new BadRequestException('Нужны entityType и entityId');
    }
    return this.documentsService.listFor(req.tenantId, req.user.sub, entityType, entityId);
  }

  @Get(':id/content')
  @RequirePermission('engagement', 'view')
  @ApiOperation({ summary: 'Скачать документ (авторизованно, метаданные под RLS)' })
  async content(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { filename, stored } = await this.documentsService.content(req.tenantId, id);
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
