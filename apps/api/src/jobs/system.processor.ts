import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { JobsService } from './jobs.service';
import { JOB_DEMO_DELAYED, JOB_HEARTBEAT, SYSTEM_QUEUE } from './jobs.constants';

/** Worker в том же процессе — монолит (ADR-0008); вынести отдельно можно без смены кода джоб. */
@Processor(SYSTEM_QUEUE)
export class SystemProcessor extends WorkerHost {
  constructor(private readonly jobsService: JobsService) {
    super();
  }

  async process(job: Job): Promise<string | undefined> {
    switch (job.name) {
      case JOB_DEMO_DELAYED:
        return `обработано: ${new Date().toISOString()}`;
      case JOB_HEARTBEAT:
        await this.jobsService.recordHeartbeat();
        return undefined;
      default:
        throw new Error(`Неизвестная джоба «${job.name}» в очереди ${SYSTEM_QUEUE}`);
    }
  }
}
