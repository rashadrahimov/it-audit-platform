import { Module } from '@nestjs/common';
import { AccessReviewsModule } from './access-reviews/access-reviews.module';
import { AccountsModule } from './accounts/accounts.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
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
import { RbacModule } from './rbac/rbac.module';
import { ReportsModule } from './reports/reports.module';
import { TestsModule } from './tests/tests.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    AccessReviewsModule,
    AccountsModule,
    AuditModule,
    AuthModule,
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
    RbacModule,
    ReportsModule,
    TestsModule,
    UsersModule,
  ],
  controllers: [HealthController, InfraHealthController],
  providers: [InfraHealthService],
})
export class AppModule {}
