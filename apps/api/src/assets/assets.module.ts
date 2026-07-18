import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConnectorsModule } from '../connectors/connectors.module';
import { RbacModule } from '../rbac/rbac.module';
import { UniverseModule } from '../universe/universe.module';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';

@Module({
  imports: [AuthModule, RbacModule, UniverseModule, ConnectorsModule],
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
