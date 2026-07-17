import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { env } from '../env';
import { SYSTEM_QUEUE } from './jobs.constants';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { SystemProcessor } from './system.processor';

const redisUrl = new URL(env.redisUrl);

@Module({
  imports: [
    BullModule.forRoot({
      connection: { host: redisUrl.hostname, port: Number(redisUrl.port || '6379') },
    }),
    BullModule.registerQueue({ name: SYSTEM_QUEUE }),
  ],
  controllers: [JobsController],
  providers: [JobsService, SystemProcessor],
})
export class JobsModule {}
