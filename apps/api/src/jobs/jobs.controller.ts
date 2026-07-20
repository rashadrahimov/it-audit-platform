import {
  Controller,
  DefaultValuePipe,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import type { DemoJobEnqueued, DemoJobStatus, HeartbeatStatus } from '@it-audit/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FindingRemindersService } from './finding-reminders.service';
import { PolicyRenewalRemindersService } from './policy-renewal-reminders.service';
import { WeeklyDigestService } from './weekly-digest.service';
import { JobsService } from './jobs.service';
import { SlaService, type SlaRecalcResult } from './sla.service';

@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly slaService: SlaService,
    private readonly findingRemindersService: FindingRemindersService,
    private readonly policyRenewalRemindersService: PolicyRenewalRemindersService,
    private readonly weeklyDigestService: WeeklyDigestService,
  ) {}

  @Post('finding-reminders')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Напоминания о дедлайнах findings вручную (T-039); планово — раз в сутки',
  })
  @ApiCreatedResponse({ description: '{sent} — сколько писем отправлено' })
  findingReminders(): Promise<{ sent: number }> {
    return this.findingRemindersService.send();
  }

  @Post('policy-renewal-reminders')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Напоминания о продлении политик вручную (T-V04); планово — раз в сутки',
  })
  @ApiCreatedResponse({ description: '{sent}' })
  policyRenewalReminders(): Promise<{ sent: number }> {
    return this.policyRenewalRemindersService.send();
  }

  @Post('weekly-digest')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Дайджест комплаенса вручную (T-V20); планово — раз в сутки по настройке тенанта',
  })
  @ApiCreatedResponse({ description: '{tenants, emails}' })
  weeklyDigest(): Promise<{ tenants: number; emails: number }> {
    // ручной прогон игнорирует day-of-week: слать всем, у кого digest не off
    return this.weeklyDigestService.send(new Date(Date.UTC(2000, 0, 3))); // понедельник
  }

  @Post('sla-recalc')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'SLA-пересчёт вручную (T-043); планово — раз в час' })
  @ApiCreatedResponse({ description: '{findings, tests} — сколько строк пересчитано' })
  slaRecalc(): Promise<SlaRecalcResult> {
    return this.slaService.recalc();
  }

  @Post('demo')
  @ApiOperation({ summary: 'Поставить тестовую отложенную задачу (DoD T-040)' })
  @ApiQuery({
    name: 'delayMs',
    required: false,
    description: 'Задержка, мс (0–60000, дефолт 2000)',
  })
  @ApiCreatedResponse({ description: 'Задача поставлена в очередь' })
  enqueueDemo(
    @Query('delayMs', new DefaultValuePipe(2000), ParseIntPipe) delayMs: number,
  ): Promise<DemoJobEnqueued> {
    return this.jobsService.enqueueDemo(Math.min(Math.max(delayMs, 0), 60_000));
  }

  @Get('demo/:id')
  @ApiOperation({ summary: 'Статус тестовой задачи' })
  @ApiOkResponse({ description: 'Состояние задачи и результат' })
  @ApiNotFoundResponse({ description: 'Задача не найдена' })
  async demoStatus(@Param('id') id: string): Promise<DemoJobStatus> {
    const status = await this.jobsService.demoStatus(id);
    if (!status) throw new NotFoundException(`Задача ${id} не найдена`);
    return status;
  }

  @Get('heartbeat')
  @ApiOperation({ summary: 'Последний прогон heartbeat-планировщика' })
  @ApiOkResponse({ description: 'Время последнего прогона (null, если ещё не было)' })
  heartbeat(): Promise<HeartbeatStatus> {
    return this.jobsService.heartbeat();
  }
}
