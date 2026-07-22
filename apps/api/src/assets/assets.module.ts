import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConnectorsModule } from '../connectors/connectors.module';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';
import { RbacModule } from '../rbac/rbac.module';
import { UniverseModule } from '../universe/universe.module';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';

@Module({
  imports: [AuthModule, RbacModule, UniverseModule, ConnectorsModule, CustomFieldsModule],
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
