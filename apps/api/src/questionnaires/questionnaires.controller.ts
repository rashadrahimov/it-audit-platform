import {
  BadRequestException,
  Body,
  Controller,
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
import { filterParam } from '../list-filters';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { QuestionnairesService } from './questionnaires.service';

const createSchema = z.object({ title: z.string().min(1), source: z.string().optional() });
const questionSchema = z.object({ question: z.string().min(1) });
const answerSchema = z
  .object({ answer: z.string().optional(), kbEntryId: z.uuid().optional() })
  .refine((v) => v.answer || v.kbEntryId, 'Нужен answer или kbEntryId');

@Controller('questionnaires')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class QuestionnairesController {
  constructor(private readonly service: QuestionnairesService) {}

  @Post()
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Создать опросник (T-083, EP-QA)' })
  @ApiCreatedResponse({ description: '{id, status}' })
  create(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = createSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.create(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      parsed.data,
    );
  }

  @Post(':id/questions')
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Добавить вопрос в опросник' })
  addQuestion(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = questionSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.addQuestion(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      id,
      parsed.data.question,
    );
  }

  @Post('answers/:answerId')
  @HttpCode(200)
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Ответить вручную или reuse из KB (kbEntryId)' })
  answer(
    @Req() req: TenantRequest,
    @Param('answerId', ParseUUIDPipe) answerId: string,
    @Body() body: unknown,
  ) {
    const parsed = answerSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.answer(
      { tenantId: req.tenantId, userId: req.user.sub, ip: req.ip },
      answerId,
      parsed.data,
    );
  }

  @Post(':id/submit')
  @HttpCode(200)
  @RequirePermission('control', 'edit', 'edit')
  @ApiOperation({ summary: 'Отправить опросник (все вопросы отвечены, иначе 400)' })
  submit(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.submit({ tenantId: req.tenantId, userId: req.user.sub, ip: req.ip }, id);
  }

  @Get()
  @RequirePermission('control', 'view')
  @ApiQuery({ name: 'status', required: false })
  @ApiOperation({ summary: 'Опросники тенанта; фильтр: ?status= (T-V16)' })
  list(@Req() req: TenantRequest, @Query('status') status?: string) {
    return this.service.list(req.tenantId, { status: filterParam(status, 'status') });
  }

  @Get(':id/suggestions')
  @RequirePermission('control', 'view')
  @ApiOperation({
    summary: 'Auto-suggest ответов из KB для неотвеченных вопросов (T-V42, без LLM)',
  })
  suggestions(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.suggestions(req.tenantId, id);
  }

  @Get(':id')
  @RequirePermission('control', 'view')
  @ApiOperation({ summary: 'Опросник + ответы' })
  get(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(req.tenantId, id);
  }
}
