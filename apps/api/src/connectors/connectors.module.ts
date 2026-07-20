import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { ConnectorAutoSyncService } from './connector-autosync.service';
import { ConnectorSyncService } from './connector-sync.service';
import { ConnectorsController } from './connectors.controller';
import { ConnectorsService } from './connectors.service';
import { LdapConnectorProvider } from './providers/ldap.provider';
import { ManualConnectorProvider } from './providers/manual.provider';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [ConnectorsController],
  providers: [
    ConnectorsService,
    ConnectorSyncService,
    ConnectorAutoSyncService,
    LdapConnectorProvider,
    ManualConnectorProvider,
  ],
  exports: [ConnectorsService, ConnectorSyncService, ConnectorAutoSyncService],
})
export class ConnectorsModule {}
