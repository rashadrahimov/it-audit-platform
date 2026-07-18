import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { ConnectorSyncService } from './connector-sync.service';
import { ConnectorsController } from './connectors.controller';
import { ConnectorsService } from './connectors.service';
import { LdapConnectorProvider } from './providers/ldap.provider';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [ConnectorsController],
  providers: [ConnectorsService, ConnectorSyncService, LdapConnectorProvider],
  exports: [ConnectorsService, ConnectorSyncService],
})
export class ConnectorsModule {}
