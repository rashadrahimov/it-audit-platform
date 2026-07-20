import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConnectorsModule } from '../connectors/connectors.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RbacModule } from '../rbac/rbac.module';
import { AutoTestService } from './auto-test.service';
import { TestsController } from './tests.controller';
import { TestsService } from './tests.service';

@Module({
  imports: [AuthModule, RbacModule, ConnectorsModule, NotificationsModule],
  controllers: [TestsController],
  providers: [TestsService, AutoTestService],
  exports: [AutoTestService],
})
export class TestsModule {}
