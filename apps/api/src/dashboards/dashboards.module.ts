import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { DashboardsController } from './dashboards.controller';
import { DashboardsService } from './dashboards.service';
import { MetricsService } from './metrics.service';
import { SnapshotsController } from './snapshots.controller';
import { SnapshotsService } from './snapshots.service';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [DashboardsController, SnapshotsController],
  providers: [DashboardsService, MetricsService, SnapshotsService],
  exports: [MetricsService],
})
export class DashboardsModule {}
