import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import type { HealthResponse } from '@it-audit/shared';

@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Liveness-проба сервиса' })
  @ApiOkResponse({ description: 'Сервис работает' })
  health(): HealthResponse {
    return {
      status: 'ok',
      service: 'api',
      version: '0.0.1',
      timestamp: new Date().toISOString(),
    };
  }
}
