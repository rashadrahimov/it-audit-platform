import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConnectorsModule } from '../connectors/connectors.module';
import { RbacModule } from '../rbac/rbac.module';
import { PersonnelController } from './personnel.controller';
import { PersonnelService } from './personnel.service';

@Module({
  imports: [AuthModule, RbacModule, ConnectorsModule],
  controllers: [PersonnelController],
  providers: [PersonnelService],
  exports: [PersonnelService],
})
export class PersonnelModule {}
