import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { env } from '../env';
import { UsersService } from '../users/users.service';
import { JobsService } from './jobs.service';
import {
  JOB_DEACTIVATE_INACTIVE,
  JOB_DEMO_DELAYED,
  JOB_HEARTBEAT,
  SYSTEM_QUEUE,
} from './jobs.constants';

/** Worker в том же процессе — монолит (ADR-0008); вынести отдельно можно без смены кода джоб. */
@Processor(SYSTEM_QUEUE)
export class SystemProcessor extends WorkerHost {
  constructor(
    private readonly jobsService: JobsService,
    private readonly usersService: UsersService,
  ) {
    super();
  }

  async process(job: Job): Promise<string | undefined> {
    switch (job.name) {
      case JOB_DEMO_DELAYED:
        return `обработано: ${new Date().toISOString()}`;
      case JOB_HEARTBEAT:
        await this.jobsService.recordHeartbeat();
        return undefined;
      case JOB_DEACTIVATE_INACTIVE: {
        const count = await this.usersService.deactivateInactive(env.inactivityDeactivationDays);
        return `деактивировано: ${count}`;
      }
      default:
        throw new Error(`Неизвестная джоба «${job.name}» в очереди ${SYSTEM_QUEUE}`);
    }
  }
}
