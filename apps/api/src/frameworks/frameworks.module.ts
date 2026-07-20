import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { FrameworksController } from './frameworks.controller';
import { FrameworksService } from './frameworks.service';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [FrameworksController],
  providers: [FrameworksService],
})
export class FrameworksModule {}
