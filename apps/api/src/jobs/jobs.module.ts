import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { env } from '../env';
import { TestsModule } from '../tests/tests.module';
import { UsersModule } from '../users/users.module';
import { FindingRemindersService } from './finding-reminders.service';
import { PolicyRenewalRemindersService } from './policy-renewal-reminders.service';
import { SYSTEM_QUEUE } from './jobs.constants';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { SlaService } from './sla.service';
import { SystemProcessor } from './system.processor';

const redisUrl = new URL(env.redisUrl);

@Module({
  imports: [
    BullModule.forRoot({
      connection: { host: redisUrl.hostname, port: Number(redisUrl.port || '6379') },
    }),
    BullModule.registerQueue({ name: SYSTEM_QUEUE }),
    AuthModule,
    EmailModule,
    TestsModule,
    UsersModule,
  ],
  controllers: [JobsController],
  providers: [
    FindingRemindersService,
    PolicyRenewalRemindersService,
    JobsService,
    SlaService,
    SystemProcessor,
  ],
})
export class JobsModule {}
