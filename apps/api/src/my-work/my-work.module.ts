import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { MyWorkController } from './my-work.controller';
import { MyWorkService } from './my-work.service';

/** T-V18: персональный агрегат «назначено мне». */
@Module({
  imports: [AuthModule, RbacModule],
  controllers: [MyWorkController],
  providers: [MyWorkService],
})
export class MyWorkModule {}
