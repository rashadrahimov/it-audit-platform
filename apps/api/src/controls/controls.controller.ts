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
import { filterParam } from '../list-filters';
import { ControlsService, type ControlDetail, type ControlListItem } from './controls.service';

function parseLocale(localeQuery?: string): Locale {
  if (localeQuery === undefined) return DEFAULT_LOCALE;
  const parsed = localeSchema.safeParse(localeQuery);
  if (!parsed.success) throw new BadRequestException('locale: ожидается en|az|ru');
  return parsed.data;
}

@Controller('controls')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ControlsController {
  constructor(private readonly controlsService: ControlsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Библиотека контролей с маппингом на стандарты (T-031); ?tenantSlug — плюс адаптации; фильтры: ?domainCode=, ?q= (T-V16)',
  })
  @ApiQuery({ name: 'tenantSlug', required: false })
  @ApiQuery({ name: 'domainCode', required: false })
  @ApiQuery({ name: 'q', required: false, description: 'подстрока в ref/objective' })
  @ApiQuery({ name: 'locale', required: false, description: 'en|az|ru; дефолт en' })
  @ApiOkResponse({ description: '[{ref, domain, objective, question, standards[]}]' })
  list(
    @Query('tenantSlug') tenantSlug?: string,
    @Query('domainCode') domainCode?: string,
    @Query('q') q?: string,
    @Query('locale') localeQuery?: string,
  ): Promise<ControlListItem[]> {
    return this.controlsService.list(tenantSlug, parseLocale(localeQuery), {
      domainCode: filterParam(domainCode, 'domainCode'),
      q: q && q.length <= 128 ? q : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Карточка контроля (T-032): поля, owner, стандарты, history, comments',
  })
  @ApiQuery({ name: 'tenantSlug', required: false })
  @ApiQuery({ name: 'locale', required: false })
  @ApiOkResponse({
    description:
      '{ref, domain, objective, question, guidance, owner, standards[], history[], comments[]}',
  })
  detail(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('tenantSlug') tenantSlug?: string,
    @Query('locale') localeQuery?: string,
  ): Promise<ControlDetail> {
    return this.controlsService.detail(id, tenantSlug, parseLocale(localeQuery));
  }
}
