import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { TrustService } from './trust.service';

/** ПУБЛИЧНЫЙ Trust Center (T-080): без auth-guard — доступен анонимно по slug. */
@Controller('trust')
export class TrustPublicController {
  constructor(private readonly service: TrustService) {}

  @Get(':slug')
  @ApiOperation({ summary: 'Публичная страница Trust Center по slug (без auth)' })
  @ApiOkResponse({ description: '{slug, title, intro, items:[{label, category}]}' })
  publicView(@Param('slug') slug: string) {
    return this.service.publicView(slug);
  }
}
