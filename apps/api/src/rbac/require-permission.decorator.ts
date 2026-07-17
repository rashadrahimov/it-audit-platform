import { SetMetadata } from '@nestjs/common';
import type { PermissionLevel } from '@it-audit/shared';

export const PERMISSION_KEY = 'required_permission';

export interface RequiredPermission {
  resource: string;
  action: string;
  /** view пропускает view|edit; edit — только edit (ADR-0013). */
  level: Exclude<PermissionLevel, 'none'>;
}

export const RequirePermission = (
  resource: string,
  action: string,
  level: RequiredPermission['level'] = 'view',
) => SetMetadata(PERMISSION_KEY, { resource, action, level } satisfies RequiredPermission);
