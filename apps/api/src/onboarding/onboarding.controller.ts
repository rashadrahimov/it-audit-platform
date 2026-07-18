import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard, type TenantRequest } from '../rbac/permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { OnboardingService } from './onboarding.service';

@Controller('onboarding')
@UseGuards(JwtAuthGuard, PermissionGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'X-Tenant-Slug', required: true })
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get()
  @RequirePermission('settings', 'view')
  @ApiOperation({ summary: 'Onboarding-шаги тенанта (T-046): вычисляются из данных' })
  @ApiOkResponse({ description: '{steps: [{key, done}], done, total}' })
  steps(@Req() req: TenantRequest) {
    return this.onboardingService.steps(req.tenantId);
  }
}
