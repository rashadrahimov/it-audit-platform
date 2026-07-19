import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation } from '@nestjs/swagger';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { AiService } from './ai.service';

const draftSchema = z.object({
  ref: z.string().optional(),
  question: z.string().min(1),
  complianceStatus: z.string().optional(),
  evidence: z.string().optional(),
});

const configSchema = z.object({
  provider: z.enum(['none', 'anthropic', 'openai_compat']),
  baseUrl: z.string().optional(),
  model: z.string().optional(),
  apiKey: z.string().optional(),
});

/** Ассист-эндпоинты поверх LLM (EP-AI, T-H21/H22/H23). ИИ выключен по умолчанию → детерминированный fallback. */
@Controller('ai')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('status')
  @ApiOperation({ summary: 'Статус деплой-уровневого LLM-провайдера (env)' })
  status() {
    return this.ai.status();
  }

  @Get('config')
  @UseGuards(PermissionGuard)
  @RequirePermission('settings', 'view')
  @ApiHeader({ name: 'X-Tenant-Slug', required: true })
  @ApiOperation({ summary: 'Per-tenant выбор провайдера ИИ (без ключа — только hasKey)' })
  getConfig(@Req() req: TenantRequest) {
    return this.ai.getTenantConfig(req.tenantId);
  }

  @Put('config')
  @UseGuards(PermissionGuard)
  @RequirePermission('settings', 'edit', 'edit')
  @ApiHeader({ name: 'X-Tenant-Slug', required: true })
  @ApiOperation({ summary: 'Тенант выбирает провайдера ИИ (Claude/GPT/Kimi/локальная)' })
  setConfig(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = configSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.ai.setTenantConfig(req.tenantId, parsed.data);
  }

  @Post('draft-finding')
  @UseGuards(PermissionGuard)
  @RequirePermission('engagement', 'edit', 'edit')
  @ApiHeader({ name: 'X-Tenant-Slug', required: true })
  @ApiOperation({
    summary: 'Черновик finding по пункту чеклиста (LLM тенанта или детерминированный fallback)',
  })
  async draftFinding(@Req() req: TenantRequest, @Body() body: unknown) {
    const parsed = draftSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    const { ref, question, complianceStatus, evidence } = parsed.data;

    const system =
      'Ты ассистент ИТ-аудитора. По пункту чеклиста контроля с несоответствием сформулируй ' +
      'краткий finding: суть проблемы и рекомендацию. Деловой тон, 2–4 предложения.';
    const user = [
      ref ? `Референс контроля: ${ref}` : null,
      `Вопрос/требование: ${question}`,
      complianceStatus ? `Статус соответствия: ${complianceStatus}` : null,
      evidence ? `Доказательства/заметки: ${evidence}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const llm = await this.ai.draftTextForTenant(req.tenantId, system, user);
    if (llm) return { source: 'llm', text: llm };

    // Детерминированный fallback (ИИ выключен или недоступен)
    const prefix = ref ? `${ref}: ` : '';
    return {
      source: 'deterministic',
      text:
        `${prefix}Выявлено несоответствие требованию «${question}»` +
        `${complianceStatus ? ` (статус: ${complianceStatus})` : ''}. ` +
        'Рекомендуется устранить gap и предоставить подтверждающие доказательства.',
    };
  }
}
