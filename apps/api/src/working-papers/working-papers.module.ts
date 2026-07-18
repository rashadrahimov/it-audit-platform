import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { WorkingPapersController } from './working-papers.controller';
import { WorkingPapersService } from './working-papers.service';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [WorkingPapersController],
  providers: [WorkingPapersService],
})
export class WorkingPapersModule {}
