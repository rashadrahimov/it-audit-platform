import { BadRequestException, Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { SearchService } from './search.service';

@Controller('search')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class SearchController {
  constructor(private readonly service: SearchService) {}

  @Get()
  @RequirePermission('engagement', 'view')
  @ApiOperation({ summary: 'Глобальный поиск по сущностям (T-094, GEN-05)' })
  @ApiQuery({ name: 'q', required: true })
  @ApiOkResponse({ description: '{query, hits:[{type, id, label, snippet}]}' })
  search(@Req() req: TenantRequest, @Query('q') q?: string) {
    if (!q) throw new BadRequestException('Нужен параметр q');
    return this.service.search(req.tenantId, q);
  }
}
