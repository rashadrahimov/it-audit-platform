import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { DEFAULT_LOCALE, localeSchema } from '@it-audit/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ControlsService, type ControlListItem } from './controls.service';

@Controller('controls')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ControlsController {
  constructor(private readonly controlsService: ControlsService) {}

  @Get()
  @ApiOperation({
    summary: 'Библиотека контролей с маппингом на стандарты (T-031); ?tenantSlug — плюс адаптации',
  })
  @ApiQuery({ name: 'tenantSlug', required: false })
  @ApiQuery({ name: 'locale', required: false, description: 'en|az|ru; дефолт en' })
  @ApiOkResponse({ description: '[{ref, domain, objective, question, standards[]}]' })
  list(
    @Query('tenantSlug') tenantSlug?: string,
    @Query('locale') localeQuery?: string,
  ): Promise<ControlListItem[]> {
    let locale = DEFAULT_LOCALE;
    if (localeQuery !== undefined) {
      const parsed = localeSchema.safeParse(localeQuery);
      if (!parsed.success) throw new BadRequestException('locale: ожидается en|az|ru');
      locale = parsed.data;
    }
    return this.controlsService.list(tenantSlug, locale);
  }
}
