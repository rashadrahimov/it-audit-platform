import { z } from 'zod';
import { localeSchema } from './i18n';

/** Контракты /email — отправка писем через провайдер-абстракцию (T-041). */
export const emailDemoRequestSchema = z.object({
  to: z.email().optional(),
  locale: localeSchema.optional(),
});

export const emailDemoResponseSchema = z.object({
  to: z.email(),
  locale: localeSchema,
  subject: z.string(),
  messageId: z.string(),
});

export type EmailDemoRequest = z.infer<typeof emailDemoRequestSchema>;
export type EmailDemoResponse = z.infer<typeof emailDemoResponseSchema>;
