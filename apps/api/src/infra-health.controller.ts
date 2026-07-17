import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import { InfraHealthService } from './infra-health.service';

@Controller('health/infra')
export class InfraHealthController {
  constructor(private readonly infraHealth: InfraHealthService) {}

  @Get()
  @ApiOperation({ summary: 'Доступность инфраструктуры: Postgres, Redis, S3 (MinIO), SMTP' })
  @ApiOkResponse({ description: 'Все сервисы доступны' })
  @ApiServiceUnavailableResponse({
    description: 'Хотя бы один сервис недоступен (status: degraded)',
  })
  async infra(@Res({ passthrough: true }) res: Response) {
    const result = await this.infraHealth.check();
    if (result.status !== 'ok') res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return result;
  }
}
