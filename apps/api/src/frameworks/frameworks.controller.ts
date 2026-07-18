import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { DEFAULT_LOCALE, localeSchema, type Locale } from '@it-audit/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FrameworksService, type FrameworkListItem } from './frameworks.service';

function parseLocale(localeQuery?: string): Locale {
  if (localeQuery === undefined) return DEFAULT_LOCALE;
  const parsed = localeSchema.safeParse(localeQuery);
  if (!parsed.success) throw new BadRequestException('locale: ожидается en|az|ru');
  return parsed.data;
}

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
    return this.frameworksService.list(tenantSlug, parseLocale(localeQuery));
  }

  @Get(':id/requirements')
  @ApiOperation({ summary: 'Дерево требований фреймворка (T-078, EP-FWK)' })
  @ApiQuery({ name: 'locale', required: false })
  @ApiOkResponse({ description: '{id, name, version, requirements:[{id, ref, title, parentId}]}' })
  requirements(@Param('id', ParseUUIDPipe) id: string, @Query('locale') localeQuery?: string) {
    return this.frameworksService.requirements(id, parseLocale(localeQuery));
  }
}
