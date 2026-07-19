import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { and, eq } from 'drizzle-orm';
import { localeSchema } from '@it-audit/shared';
import { DbService } from '../db/db.service';
import { EmailService } from '../email/email.service';
import type { EmailTemplateId } from '../email/email.templates';
import { membership, notification, tenant, user } from '../db/schema';
import { JOB_NOTIFICATION_EMAIL, SYSTEM_QUEUE } from '../jobs/jobs.constants';

/** Настройки уведомлений тенанта (T-V19, Settings→Notifications у Vanta). */
export interface NotificationSettings {
  emailEnabled: boolean;
  schedule: 'anytime' | 'work_hours';
  timezone: string;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  emailEnabled: true,
  schedule: 'anytime',
  timezone: 'UTC',
};

/**
 * T-V19: события платформы → уведомления. In-app создаётся всегда; email — по
 * настройке тенанта: anytime сразу, work_hours (9–18 в таймзоне) — вне окна
 * откладывается BullMQ-delay до следующего рабочего утра.
 */
@Injectable()
export class NotificationDispatchService {
  constructor(
    private readonly dbService: DbService,
    private readonly emailService: EmailService,
    @InjectQueue(SYSTEM_QUEUE) private readonly queue: Queue,
  ) {}

  async settingsOf(tenantId: string): Promise<NotificationSettings> {
    const [t] = await this.dbService.db.select().from(tenant).where(eq(tenant.id, tenantId));
    const raw =
      t && typeof t.settings === 'object' && t.settings !== null
        ? ((t.settings as Record<string, unknown>).notifications as
            Partial<NotificationSettings> | undefined)
        : undefined;
    return { ...DEFAULT_NOTIFICATION_SETTINGS, ...raw };
  }

  async saveSettings(tenantId: string, input: Partial<NotificationSettings>) {
    const [t] = await this.dbService.db.select().from(tenant).where(eq(tenant.id, tenantId));
    const settings = (t?.settings ?? {}) as Record<string, unknown>;
    const merged = {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      ...(settings.notifications as object),
      ...input,
    };
    await this.dbService.db
      .update(tenant)
      .set({ settings: { ...settings, notifications: merged } })
      .where(eq(tenant.id, tenantId));
    return merged;
  }

  /** Задержка до окна 9–18 в таймзоне тенанта; 0 = слать сейчас. Ошибочная TZ → 0. */
  workHoursDelayMs(settings: NotificationSettings, now = new Date()): number {
    if (settings.schedule !== 'work_hours') return 0;
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
        timeZone: settings.timezone,
      }).formatToParts(now);
      const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
      const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
      if (hour >= 9 && hour < 18) return 0;
      const minutesUntilNine = hour < 9 ? (9 - hour) * 60 - minute : (24 - hour + 9) * 60 - minute;
      return minutesUntilNine * 60 * 1000;
    } catch {
      return 0;
    }
  }

  /** Событие → in-app (всегда) + email (по настройке тенанта). */
  async notify(input: {
    tenantId: string;
    recipientMembershipId: string;
    type?: 'info' | 'warning' | 'action';
    title: string;
    body?: string;
    email?: { template: EmailTemplateId; params: Record<string, string> };
  }): Promise<void> {
    try {
      await this.dbService.withTenant(input.tenantId, (tx) =>
        tx.insert(notification).values({
          tenantId: input.tenantId,
          recipientMembershipId: input.recipientMembershipId,
          title: input.title,
          type: input.type ?? 'action',
          body: input.body ?? null,
        }),
      );
      if (!input.email) return;
      const settings = await this.settingsOf(input.tenantId);
      if (!settings.emailEnabled) return;
      const [person] = await this.dbService.db
        .select({ email: user.email, locale: user.locale })
        .from(membership)
        .innerJoin(user, eq(membership.userId, user.id))
        .where(
          and(
            eq(membership.id, input.recipientMembershipId),
            eq(membership.tenantId, input.tenantId),
          ),
        );
      if (!person) return;
      const parsedLocale = localeSchema.safeParse(person.locale);
      const locale = parsedLocale.success ? parsedLocale.data : 'en';
      const delay = this.workHoursDelayMs(settings);
      if (delay === 0) {
        await this.emailService.sendTemplate(
          input.email.template,
          locale,
          person.email,
          input.email.params,
        );
      } else {
        await this.queue.add(
          JOB_NOTIFICATION_EMAIL,
          { template: input.email.template, locale, to: person.email, params: input.email.params },
          { delay },
        );
      }
    } catch {
      // уведомления не должны ронять доменную операцию (паттерн audit_log T-021)
    }
  }
}
