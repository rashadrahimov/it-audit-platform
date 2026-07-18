import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [PlansController],
  providers: [PlansService],
})
export class PlansModule {}
