import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { AccessReviewsController } from './access-reviews.controller';
import { AccessReviewsService } from './access-reviews.service';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [AccessReviewsController],
  providers: [AccessReviewsService],
})
export class AccessReviewsModule {}
