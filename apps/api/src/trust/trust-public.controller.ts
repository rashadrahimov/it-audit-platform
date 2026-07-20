import { BadRequestException, Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { z } from 'zod';
import { TrustService } from './trust.service';

const accessRequestSchema = z.object({
  email: z.email(),
  company: z.string().optional(),
  message: z.string().optional(),
});

/** ПУБЛИЧНЫЙ Trust Center (T-080/081): без auth-guard — доступен анонимно по slug. */
@Controller('trust')
export class TrustPublicController {
  constructor(private readonly service: TrustService) {}

  @Get(':slug')
  @ApiOperation({
    summary: 'Публичная страница Trust Center по slug (без auth; просмотр логируется)',
  })
  @ApiOkResponse({ description: '{slug, title, intro, items:[{label, category}]}' })
  publicView(@Param('slug') slug: string) {
    return this.service.publicView(slug);
  }

  @Get(':slug/granted/:token')
  @ApiOperation({ summary: 'Granted-вид по токену доступа (T-V30, без auth)' })
  @ApiOkResponse({ description: '{title, grantedTo, items}' })
  grantedView(@Param('slug') slug: string, @Param('token') token: string) {
    return this.service.grantedView(slug, token);
  }

  @Post(':slug/access-requests')
  @ApiOperation({ summary: 'Публичный запрос доступа к деталям (T-081, без auth)' })
  @ApiCreatedResponse({ description: '{id, status}' })
  requestAccess(@Param('slug') slug: string, @Body() body: unknown) {
    const parsed = accessRequestSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.service.requestAccess(slug, parsed.data);
  }
}
