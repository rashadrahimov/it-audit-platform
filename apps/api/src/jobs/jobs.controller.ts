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
import { JobsService } from './jobs.service';
import { SlaService, type SlaRecalcResult } from './sla.service';

@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly slaService: SlaService,
  ) {}

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
