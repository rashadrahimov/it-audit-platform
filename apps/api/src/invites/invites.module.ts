import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { LicenseModule } from '../license/license.module';
import { RbacModule } from '../rbac/rbac.module';
import { InvitesController } from './invites.controller';
import { InvitesService } from './invites.service';

@Module({
  imports: [AuthModule, EmailModule, LicenseModule, RbacModule],
  controllers: [InvitesController],
  providers: [InvitesService],
})
export class InvitesModule {}
