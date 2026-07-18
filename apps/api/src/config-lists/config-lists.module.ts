import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { ConfigListsController } from './config-lists.controller';
import { ConfigListsService } from './config-lists.service';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [ConfigListsController],
  providers: [ConfigListsService],
  exports: [ConfigListsService],
})
export class ConfigListsModule {}
