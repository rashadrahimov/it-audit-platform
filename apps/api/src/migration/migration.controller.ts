import {
  BadRequestException,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiHeader, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { parseChecklistWorkbook } from './checklist-workbook';
import { MigrationService } from './migration.service';

const MAX_FILE_SIZE = 25 * 1024 * 1024;

@Controller('migration')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class MigrationController {
  constructor(private readonly service: MigrationService) {}

  @Post('checklist/preview')
  @RequirePermission('settings', 'edit', 'edit')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  @ApiOperation({
    summary: 'Разобрать загруженный чеклист-шаблон .xlsx (dry-run, T-H12, EP-MIGRATE)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  async previewChecklist(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Нужен multipart-файл в поле «file» (.xlsx)');
    return this.service.previewChecklist(file.buffer);
  }

  @Post('checklist/import')
  @RequirePermission('settings', 'edit', 'edit')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  @ApiOperation({ summary: 'Импорт контролей из чеклист-шаблона в тенант-библиотеку (T-H14)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  async importChecklist(
    @Req() req: TenantRequest,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException('Нужен multipart-файл в поле «file» (.xlsx)');
    const rows = await parseChecklistWorkbook(file.buffer);
    return this.service.importChecklist(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      rows,
    );
  }
}
