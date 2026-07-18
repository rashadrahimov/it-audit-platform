import { Module } from '@nestjs/common';
import { AccessRequestsModule } from './access-requests/access-requests.module';
import { AccessReviewsModule } from './access-reviews/access-reviews.module';
import { AccountsModule } from './accounts/accounts.module';
import { AssetsModule } from './assets/assets.module';
import { AuditModule } from './audit/audit.module';
import { AuditTypesModule } from './audit-types/audit-types.module';
import { AuthModule } from './auth/auth.module';
import { ChangesModule } from './changes/changes.module';
import { CommentsModule } from './comments/comments.module';
import { CommitmentsModule } from './commitments/commitments.module';
import { ConfigListsModule } from './config-lists/config-lists.module';
import { ConnectorsModule } from './connectors/connectors.module';
import { ControlsModule } from './controls/controls.module';
import { CustomFieldsModule } from './custom-fields/custom-fields.module';
import { DashboardsModule } from './dashboards/dashboards.module';
import { DbModule } from './db/db.module';
import { DevicesModule } from './devices/devices.module';
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
import { KnowledgeBaseModule } from './knowledge-base/knowledge-base.module';
import { LicenseModule } from './license/license.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { PersonnelModule } from './personnel/personnel.module';
import { PoliciesModule } from './policies/policies.module';
import { PrivacyModule } from './privacy/privacy.module';
import { ProcessesModule } from './processes/processes.module';
import { QuestionnairesModule } from './questionnaires/questionnaires.module';
import { RbacModule } from './rbac/rbac.module';
import { ReportsModule } from './reports/reports.module';
import { RisksModule } from './risks/risks.module';
import { SecurityAlertsModule } from './security-alerts/security-alerts.module';
import { TagsModule } from './tags/tags.module';
import { TestsModule } from './tests/tests.module';
import { TrustModule } from './trust/trust.module';
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
    AuditTypesModule,
    AuthModule,
    ChangesModule,
    CommentsModule,
    CommitmentsModule,
    ConfigListsModule,
    ConnectorsModule,
    ControlsModule,
    CustomFieldsModule,
    DashboardsModule,
    DbModule,
    DevicesModule,
    DocumentsModule,
    EmailModule,
    EngagementsModule,
    FilesModule,
    FindingsModule,
    FrameworksModule,
    GroupModule,
    InvitesModule,
    JobsModule,
    KnowledgeBaseModule,
    LicenseModule,
    OnboardingModule,
    PersonnelModule,
    PoliciesModule,
    PrivacyModule,
    ProcessesModule,
    QuestionnairesModule,
    RbacModule,
    ReportsModule,
    RisksModule,
    SecurityAlertsModule,
    TagsModule,
    TestsModule,
    TrustModule,
    UniverseModule,
    UsersModule,
    VendorsModule,
    VulnerabilitiesModule,
  ],
  controllers: [HealthController, InfraHealthController],
  providers: [InfraHealthService],
})
export class AppModule {}
