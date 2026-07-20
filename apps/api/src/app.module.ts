import { Module } from '@nestjs/common';
import { AccessRequestsModule } from './access-requests/access-requests.module';
import { AccessReviewsModule } from './access-reviews/access-reviews.module';
import { AccountsModule } from './accounts/accounts.module';
import { AiModule } from './ai/ai.module';
import { AllocationsModule } from './allocations/allocations.module';
import { AnnotationsModule } from './annotations/annotations.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { ApiV1Module } from './api-v1/api-v1.module';
import { AssetsModule } from './assets/assets.module';
import { AuditModule } from './audit/audit.module';
import { AuditProgramsModule } from './audit-programs/audit-programs.module';
import { AuditTypesModule } from './audit-types/audit-types.module';
import { AuthModule } from './auth/auth.module';
import { ChangesModule } from './changes/changes.module';
import { CommentsModule } from './comments/comments.module';
import { CommitmentsModule } from './commitments/commitments.module';
import { ConfigListsModule } from './config-lists/config-lists.module';
import { ConfigTransferModule } from './config-transfer/config-transfer.module';
import { ConnectorsModule } from './connectors/connectors.module';
import { ControlKpisModule } from './control-kpis/control-kpis.module';
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
import { FieldPermissionsModule } from './field-permissions/field-permissions.module';
import { FilesModule } from './files/files.module';
import { FindingsModule } from './findings/findings.module';
import { FrameworksModule } from './frameworks/frameworks.module';
import { GlossaryModule } from './glossary/glossary.module';
import { GroupModule } from './group/group.module';
import { InvitesModule } from './invites/invites.module';
import { JobsModule } from './jobs/jobs.module';
import { KnowledgeBaseModule } from './knowledge-base/knowledge-base.module';
import { LicenseModule } from './license/license.module';
import { MembershipsModule } from './memberships/memberships.module';
import { MyWorkModule } from './my-work/my-work.module';
import { MigrationModule } from './migration/migration.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { PersonnelModule } from './personnel/personnel.module';
import { PlansModule } from './plans/plans.module';
import { PoliciesModule } from './policies/policies.module';
import { PrivacyModule } from './privacy/privacy.module';
import { ProcessesModule } from './processes/processes.module';
import { QuestionnairesModule } from './questionnaires/questionnaires.module';
import { RbacModule } from './rbac/rbac.module';
import { ReportsModule } from './reports/reports.module';
import { ReportsExportModule } from './reports-export/reports-export.module';
import { RisksModule } from './risks/risks.module';
import { EntityAclModule } from './entity-acl/entity-acl.module';
import { SsoConfigModule } from './sso-config/sso-config.module';
import { AuditFirmsModule } from './audit-firms/audit-firms.module';
import { SlaConfigModule } from './sla-config/sla-config.module';
import { RoadmapModule } from './roadmap/roadmap.module';
import { ContractsModule } from './contracts/contracts.module';
import { BusinessProfileModule } from './business-profile/business-profile.module';
import { TasksModule } from './tasks/tasks.module';
import { SatisfactionModule } from './satisfaction/satisfaction.module';
import { SearchModule } from './search/search.module';
import { SecurityAlertsModule } from './security-alerts/security-alerts.module';
import { TagsModule } from './tags/tags.module';
import { TestsModule } from './tests/tests.module';
import { TimeEntriesModule } from './time-entries/time-entries.module';
import { TrustModule } from './trust/trust.module';
import { UniverseModule } from './universe/universe.module';
import { UsersModule } from './users/users.module';
import { WorkingPapersModule } from './working-papers/working-papers.module';
import { VendorsModule } from './vendors/vendors.module';
import { VulnerabilitiesModule } from './vulnerabilities/vulnerabilities.module';

@Module({
  imports: [
    AccessRequestsModule,
    AccessReviewsModule,
    AccountsModule,
    AiModule,
    AllocationsModule,
    AnnotationsModule,
    ApiKeysModule,
    ApiV1Module,
    AssetsModule,
    AuditModule,
    AuditProgramsModule,
    AuditTypesModule,
    AuthModule,
    ChangesModule,
    CommentsModule,
    CommitmentsModule,
    ConfigListsModule,
    ConfigTransferModule,
    ConnectorsModule,
    ControlKpisModule,
    ControlsModule,
    CustomFieldsModule,
    DashboardsModule,
    DbModule,
    DevicesModule,
    DocumentsModule,
    EmailModule,
    EngagementsModule,
    FieldPermissionsModule,
    FilesModule,
    FindingsModule,
    FrameworksModule,
    GlossaryModule,
    GroupModule,
    InvitesModule,
    JobsModule,
    KnowledgeBaseModule,
    LicenseModule,
    MembershipsModule,
    MyWorkModule,
    MigrationModule,
    NotificationsModule,
    OnboardingModule,
    PersonnelModule,
    PlansModule,
    PoliciesModule,
    PrivacyModule,
    ProcessesModule,
    QuestionnairesModule,
    RbacModule,
    ReportsModule,
    ReportsExportModule,
    RisksModule,
    EntityAclModule,
    SsoConfigModule,
    TasksModule,
    AuditFirmsModule,
    SlaConfigModule,
    RoadmapModule,
    ContractsModule,
    BusinessProfileModule,
    SatisfactionModule,
    SearchModule,
    SecurityAlertsModule,
    TagsModule,
    TestsModule,
    TimeEntriesModule,
    TrustModule,
    UniverseModule,
    UsersModule,
    VendorsModule,
    VulnerabilitiesModule,
    WorkingPapersModule,
  ],
  controllers: [HealthController, InfraHealthController],
  providers: [InfraHealthService],
})
export class AppModule {}
