import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { CommentsController } from './comments.controller';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [CommentsController],
})
export class CommentsModule {}
