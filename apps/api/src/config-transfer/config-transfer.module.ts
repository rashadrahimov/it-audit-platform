import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { ConfigTransferController } from './config-transfer.controller';
import { ConfigTransferService } from './config-transfer.service';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [ConfigTransferController],
  providers: [ConfigTransferService],
})
export class ConfigTransferModule {}
