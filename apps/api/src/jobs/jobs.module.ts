import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AuthModule } from '../auth/auth.module';
import { ConnectorsModule } from '../connectors/connectors.module';
import { EmailModule } from '../email/email.module';
import { env } from '../env';
import { TestsModule } from '../tests/tests.module';
import { UsersModule } from '../users/users.module';
import { FindingRemindersService } from './finding-reminders.service';
import { PolicyRenewalRemindersService } from './policy-renewal-reminders.service';
import { WeeklyDigestService } from './weekly-digest.service';
import { DocumentSlaService } from './document-sla.service';
import { SYSTEM_QUEUE } from './jobs.constants';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { redisConnectionOptions } from './redis-connection';
import { SlaService } from './sla.service';
import { SystemProcessor } from './system.processor';

@Module({
  imports: [
    BullModule.forRoot({
      connection: redisConnectionOptions(env.redisUrl),
    }),
    BullModule.registerQueue({ name: SYSTEM_QUEUE }),
    AuthModule,
    ConnectorsModule,
    EmailModule,
    TestsModule,
    UsersModule,
  ],
  controllers: [JobsController],
  providers: [
    FindingRemindersService,
    PolicyRenewalRemindersService,
    WeeklyDigestService,
    DocumentSlaService,
    JobsService,
    SlaService,
    SystemProcessor,
  ],
})
export class JobsModule {}
