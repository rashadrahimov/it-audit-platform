import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { DEFAULT_LOCALE, localeSchema } from '@it-audit/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FrameworksService, type FrameworkListItem } from './frameworks.service';

@Controller('frameworks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class FrameworksController {
  constructor(private readonly frameworksService: FrameworksService) {}

  @Get()
  @ApiOperation({
    summary: 'Библиотека стандартов (T-030): глобальные + адаптации тенанта при ?tenantSlug',
  })
  @ApiQuery({ name: 'tenantSlug', required: false, description: 'До тенант-контекста UI: явно' })
  @ApiQuery({ name: 'locale', required: false, description: 'en|az|ru; дефолт en' })
  @ApiOkResponse({ description: '[{id, name, version, status, isGlobal}]' })
  list(
    @Query('tenantSlug') tenantSlug?: string,
    @Query('locale') localeQuery?: string,
  ): Promise<FrameworkListItem[]> {
    let locale = DEFAULT_LOCALE;
    if (localeQuery !== undefined) {
      const parsed = localeSchema.safeParse(localeQuery);
      if (!parsed.success) throw new BadRequestException('locale: ожидается en|az|ru');
      locale = parsed.data;
    }
    return this.frameworksService.list(tenantSlug, locale);
  }
}
