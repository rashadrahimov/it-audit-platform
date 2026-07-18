import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { DemoJobEnqueued, DemoJobStatus, HeartbeatStatus } from '@it-audit/shared';
import { env } from '../env';
import {
  AUTO_TEST_RUN_EVERY_MS,
  DEACTIVATE_INACTIVE_EVERY_MS,
  FINDING_REMINDERS_EVERY_MS,
  HEARTBEAT_EVERY_MS,
  HEARTBEAT_KEY,
  JOB_AUTO_TEST_RUN,
  JOB_DEACTIVATE_INACTIVE,
  JOB_DEMO_DELAYED,
  JOB_FINDING_REMINDERS,
  JOB_HEARTBEAT,
  JOB_SLA_RECALC,
  SLA_RECALC_EVERY_MS,
  SYSTEM_QUEUE,
} from './jobs.constants';

@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly redis = new Redis(env.redisUrl, { maxRetriesPerRequest: null });

  constructor(@InjectQueue(SYSTEM_QUEUE) private readonly queue: Queue) {}

  /** Планировщик: repeatable-джобы. upsert — идемпотентно при каждом старте. */
  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      'heartbeat-scheduler',
      { every: HEARTBEAT_EVERY_MS },
      { name: JOB_HEARTBEAT },
    );
    await this.queue.upsertJobScheduler(
      'deactivate-inactive-scheduler',
      { every: DEACTIVATE_INACTIVE_EVERY_MS },
      { name: JOB_DEACTIVATE_INACTIVE },
    );
    await this.queue.upsertJobScheduler(
      'sla-recalc-scheduler',
      { every: SLA_RECALC_EVERY_MS },
      { name: JOB_SLA_RECALC },
    );
    await this.queue.upsertJobScheduler(
      'finding-reminders-scheduler',
      { every: FINDING_REMINDERS_EVERY_MS },
      { name: JOB_FINDING_REMINDERS },
    );
    await this.queue.upsertJobScheduler(
      'auto-test-run-scheduler',
      { every: AUTO_TEST_RUN_EVERY_MS },
      { name: JOB_AUTO_TEST_RUN },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => {});
  }

  async enqueueDemo(delayMs: number): Promise<DemoJobEnqueued> {
    const job = await this.queue.add(
      JOB_DEMO_DELAYED,
      { requestedAt: new Date().toISOString() },
      { delay: delayMs, removeOnComplete: 100, removeOnFail: 100 },
    );
    return { id: job.id as string, delayMs };
  }

  async demoStatus(id: string): Promise<DemoJobStatus | null> {
    const job = await this.queue.getJob(id);
    if (!job) return null;
    const state = await job.getState();
    return {
      id,
      state: state as DemoJobStatus['state'],
      returnValue: typeof job.returnvalue === 'string' ? job.returnvalue : null,
      finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
    };
  }

  async recordHeartbeat(): Promise<void> {
    await this.redis.set(HEARTBEAT_KEY, new Date().toISOString());
  }

  async heartbeat(): Promise<HeartbeatStatus> {
    return { lastRunAt: await this.redis.get(HEARTBEAT_KEY) };
  }
}
