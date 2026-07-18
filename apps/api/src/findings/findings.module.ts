import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { FindingsController } from './findings.controller';
import { FindingsService } from './findings.service';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [FindingsController],
  providers: [FindingsService],
})
export class FindingsModule {}
