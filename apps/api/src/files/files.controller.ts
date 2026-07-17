import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import type { FileUploadResponse } from '@it-audit/shared';
import { FileStorageService } from './file-storage.service';

const MAX_FILE_SIZE = 25 * 1024 * 1024;

@Controller('files')
export class FilesController {
  constructor(private readonly storage: FileStorageService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  @ApiOperation({ summary: 'Загрузить файл (multipart, поле file; до 25 МБ)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        entityType: { type: 'string', description: 'Задел под привязку к сущности (T-010+)' },
        entityId: { type: 'string' },
      },
    },
  })
  @ApiCreatedResponse({ description: 'Файл сохранён в S3-хранилище' })
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('entityType') entityType?: string,
    @Body('entityId') entityId?: string,
  ): Promise<FileUploadResponse> {
    if (!file) throw new BadRequestException('Нужен multipart-файл в поле «file»');
    // Имя файла в multipart приходит в latin1 — возвращаем UTF-8
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const key = `uploads/${randomUUID()}/${originalName}`;
    const metadata: Record<string, string> = {
      originalname: encodeURIComponent(originalName),
      ...(entityType ? { entitytype: entityType } : {}),
      ...(entityId ? { entityid: entityId } : {}),
    };
    await this.storage.put(key, file.buffer, file.mimetype, metadata);
    return {
      key,
      originalName,
      contentType: file.mimetype,
      size: file.size,
      entityType: entityType ?? null,
      entityId: entityId ?? null,
    };
  }

  @Get('content')
  @ApiOperation({ summary: 'Скачать файл по ключу' })
  @ApiQuery({ name: 'key', description: 'Ключ объекта, например uploads/<uuid>/<имя>' })
  @ApiOkResponse({ description: 'Содержимое файла' })
  @ApiNotFoundResponse({ description: 'Объект не найден' })
  async download(@Query('key') key: string): Promise<StreamableFile> {
    if (!key) throw new BadRequestException('Нужен query-параметр key');
    const object = await this.storage.get(key);
    if (!object) throw new NotFoundException(`Объект ${key} не найден`);
    const filename = object.metadata.originalname ?? key.split('/').pop() ?? 'file';
    return new StreamableFile(object.body, {
      type: object.contentType,
      length: object.contentLength,
      disposition: `attachment; filename*=UTF-8''${filename}`,
    });
  }
}
