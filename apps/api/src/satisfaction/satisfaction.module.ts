import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { SatisfactionController } from './satisfaction.controller';
import { SatisfactionService } from './satisfaction.service';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [SatisfactionController],
  providers: [SatisfactionService],
})
export class SatisfactionModule {}
