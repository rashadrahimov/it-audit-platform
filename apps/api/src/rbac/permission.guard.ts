import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { RbacService } from './rbac.service';
import { PERMISSION_KEY, type RequiredPermission } from './require-permission.decorator';

/** Запрос с установленным контекстом тенанта (после PermissionGuard). */
export interface TenantRequest extends AuthenticatedRequest {
  tenantId: string;
}

/**
 * Enforcement матрицы (T-020, ADR-0013). Вешается ПОСЛЕ JwtAuthGuard.
 * Тенант — из заголовка X-Tenant-Slug (до UI-переключателя тенантов).
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequiredPermission | undefined>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const request = context.switchToHttp().getRequest<TenantRequest>();
    const slug = request.headers['x-tenant-slug'];
    if (typeof slug !== 'string' || !slug) {
      throw new BadRequestException('Нужен заголовок X-Tenant-Slug');
    }

    const access = await this.rbacService.resolveAccess(request.user.sub, slug, required);
    if (!access.allowed) {
      throw new ForbiddenException(
        `Нет права ${required.resource}.${required.action} (уровень ${required.level})`,
      );
    }
    request.tenantId = access.tenantId;
    return true;
  }
}
