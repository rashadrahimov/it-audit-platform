import { Module } from '@nestjs/common';
import { AccessRequestsModule } from './access-requests/access-requests.module';
import { AccessReviewsModule } from './access-reviews/access-reviews.module';
import { AccountsModule } from './accounts/accounts.module';
import { AssetsModule } from './assets/assets.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { ChangesModule } from './changes/changes.module';
import { CommentsModule } from './comments/comments.module';
import { ConnectorsModule } from './connectors/connectors.module';
import { ControlsModule } from './controls/controls.module';
import { DbModule } from './db/db.module';
import { DocumentsModule } from './documents/documents.module';
import { HealthController } from './health.controller';
import { InfraHealthController } from './infra-health.controller';
import { InfraHealthService } from './infra-health.service';
import { EmailModule } from './email/email.module';
import { EngagementsModule } from './engagements/engagements.module';
import { FilesModule } from './files/files.module';
import { FindingsModule } from './findings/findings.module';
import { FrameworksModule } from './frameworks/frameworks.module';
import { GroupModule } from './group/group.module';
import { InvitesModule } from './invites/invites.module';
import { JobsModule } from './jobs/jobs.module';
import { LicenseModule } from './license/license.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { PoliciesModule } from './policies/policies.module';
import { ProcessesModule } from './processes/processes.module';
import { RbacModule } from './rbac/rbac.module';
import { ReportsModule } from './reports/reports.module';
import { RisksModule } from './risks/risks.module';
import { SecurityAlertsModule } from './security-alerts/security-alerts.module';
import { TestsModule } from './tests/tests.module';
import { UniverseModule } from './universe/universe.module';
import { UsersModule } from './users/users.module';
import { VendorsModule } from './vendors/vendors.module';
import { VulnerabilitiesModule } from './vulnerabilities/vulnerabilities.module';

@Module({
  imports: [
    AccessRequestsModule,
    AccessReviewsModule,
    AccountsModule,
    AssetsModule,
    AuditModule,
    AuthModule,
    ChangesModule,
    CommentsModule,
    ConnectorsModule,
    ControlsModule,
    DbModule,
    DocumentsModule,
    EmailModule,
    EngagementsModule,
    FilesModule,
    FindingsModule,
    FrameworksModule,
    GroupModule,
    InvitesModule,
    JobsModule,
    LicenseModule,
    OnboardingModule,
    PoliciesModule,
    ProcessesModule,
    RbacModule,
    ReportsModule,
    RisksModule,
    SecurityAlertsModule,
    TestsModule,
    UniverseModule,
    UsersModule,
    VendorsModule,
    VulnerabilitiesModule,
  ],
  controllers: [HealthController, InfraHealthController],
  providers: [InfraHealthService],
})
export class AppModule {}
