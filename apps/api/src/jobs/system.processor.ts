import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { env } from '../env';
import { UsersService } from '../users/users.service';
import { FindingRemindersService } from './finding-reminders.service';
import { JobsService } from './jobs.service';
import { SlaService } from './sla.service';
import {
  JOB_DEACTIVATE_INACTIVE,
  JOB_DEMO_DELAYED,
  JOB_FINDING_REMINDERS,
  JOB_HEARTBEAT,
  JOB_SLA_RECALC,
  SYSTEM_QUEUE,
} from './jobs.constants';

/** Worker в том же процессе — монолит (ADR-0008); вынести отдельно можно без смены кода джоб. */
@Processor(SYSTEM_QUEUE)
export class SystemProcessor extends WorkerHost {
  constructor(
    private readonly jobsService: JobsService,
    private readonly usersService: UsersService,
    private readonly slaService: SlaService,
    private readonly findingRemindersService: FindingRemindersService,
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
      case JOB_SLA_RECALC: {
        const result = await this.slaService.recalc();
        return `SLA пересчитан: findings=${result.findings}, tests=${result.tests}`;
      }
      case JOB_FINDING_REMINDERS: {
        const result = await this.findingRemindersService.send();
        return `напоминаний отправлено: ${result.sent}`;
      }
      default:
        throw new Error(`Неизвестная джоба «${job.name}» в очереди ${SYSTEM_QUEUE}`);
    }
  }
}
