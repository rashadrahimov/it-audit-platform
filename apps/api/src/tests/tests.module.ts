import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { TestsController } from './tests.controller';
import { TestsService } from './tests.service';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [TestsController],
  providers: [TestsService],
})
export class TestsModule {}
