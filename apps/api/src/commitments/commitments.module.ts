import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { CommitmentsController } from './commitments.controller';
import { CommitmentsService } from './commitments.service';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [CommitmentsController],
  providers: [CommitmentsService],
})
export class CommitmentsModule {}
