import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { env } from '../env';
import { ConnectorAutoSyncService } from '../connectors/connector-autosync.service';
import { UsersService } from '../users/users.service';
import { AutoTestService } from '../tests/auto-test.service';
import { EmailService } from '../email/email.service';
import { FindingRemindersService } from './finding-reminders.service';
import { PolicyRenewalRemindersService } from './policy-renewal-reminders.service';
import { WeeklyDigestService } from './weekly-digest.service';
import { DocumentSlaService } from './document-sla.service';
import { JobsService } from './jobs.service';
import { SlaService } from './sla.service';
import {
  JOB_AUTO_TEST_RUN,
  JOB_DEACTIVATE_INACTIVE,
  JOB_DEMO_DELAYED,
  JOB_FINDING_REMINDERS,
  JOB_NOTIFICATION_EMAIL,
  JOB_POLICY_RENEWAL_REMINDERS,
  JOB_HEARTBEAT,
  JOB_SLA_RECALC,
  JOB_WEEKLY_DIGEST,
  JOB_DOCUMENT_SLA,
  JOB_CONNECTOR_AUTOSYNC,
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
    private readonly policyRenewalRemindersService: PolicyRenewalRemindersService,
    private readonly autoTestService: AutoTestService,
    private readonly emailService: EmailService,
    private readonly weeklyDigestService: WeeklyDigestService,
    private readonly documentSlaService: DocumentSlaService,
    private readonly connectorAutoSyncService: ConnectorAutoSyncService,
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
      case JOB_NOTIFICATION_EMAIL: {
        const d = job.data as {
          template: import('../email/email.templates').EmailTemplateId;
          locale: 'en' | 'az' | 'ru';
          to: string;
          params: Record<string, string>;
        };
        await this.emailService.sendTemplate(d.template, d.locale, d.to, d.params);
        return `отложенное письмо отправлено: ${d.template}`;
      }
      case JOB_POLICY_RENEWAL_REMINDERS: {
        const result = await this.policyRenewalRemindersService.send();
        return `policy-renewal напоминаний: ${result.sent}`;
      }
      case JOB_AUTO_TEST_RUN: {
        const result = await this.autoTestService.runAll();
        return `автотестов прогнано: ${result.ran}`;
      }
      case JOB_WEEKLY_DIGEST: {
        const result = await this.weeklyDigestService.send();
        return `дайджест: тенантов=${result.tenants}, писем=${result.emails}`;
      }
      case JOB_DOCUMENT_SLA: {
        const result = await this.documentSlaService.run();
        return `document-sla: overdue=${result.overdue}, писем=${result.emails}`;
      }
      case JOB_CONNECTOR_AUTOSYNC: {
        const result = await this.connectorAutoSyncService.run();
        return `connector-autosync: тенантов=${result.tenants}, синков=${result.synced}`;
      }
      default:
        throw new Error(`Неизвестная джоба «${job.name}» в очереди ${SYSTEM_QUEUE}`);
    }
  }
}
