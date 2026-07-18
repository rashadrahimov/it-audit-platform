import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { DashboardsController } from './dashboards.controller';
import { DashboardsService } from './dashboards.service';
import { MetricsService } from './metrics.service';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [DashboardsController],
  providers: [DashboardsService, MetricsService],
  exports: [MetricsService],
})
export class DashboardsModule {}
