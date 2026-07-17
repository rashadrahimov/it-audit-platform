import { z } from 'zod';

/** Контракты /rbac — матрица прав (T-018, ADR-0013). */

export const permissionLevelSchema = z.enum(['none', 'view', 'edit']);

export const permissionSchema = z.object({
  id: z.string(),
  resource: z.string(),
  action: z.string(),
});

export const matrixCellSchema = z.object({
  resource: z.string(),
  action: z.string(),
  level: permissionLevelSchema,
});

export const roleWithMatrixSchema = z.object({
  id: z.string(),
  tenantId: z.string().nullable(),
  nameI18n: z.record(z.string(), z.string()),
  isSystem: z.boolean(),
  matrix: z.array(matrixCellSchema),
});

export type PermissionLevel = z.infer<typeof permissionLevelSchema>;
export type PermissionDto = z.infer<typeof permissionSchema>;
export type MatrixCell = z.infer<typeof matrixCellSchema>;
export type RoleWithMatrix = z.infer<typeof roleWithMatrixSchema>;
