import { z } from 'zod';

/**
 * Контракты /files — файловое хранилище поверх S3-абстракции (T-042).
 * entityType/entityId — задел под привязку к сущностям: до доменной схемы (T-010+)
 * хранятся в метаданных объекта.
 */
export const fileUploadResponseSchema = z.object({
  key: z.string(),
  originalName: z.string(),
  contentType: z.string(),
  size: z.number().int().nonnegative(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
});

export type FileUploadResponse = z.infer<typeof fileUploadResponseSchema>;
