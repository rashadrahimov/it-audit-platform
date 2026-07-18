import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { ApiKeysService } from './api-keys.service';

export interface ApiKeyRequest extends Request {
  tenantId: string;
  apiKeyId: string;
}

/** Guard программного доступа (T-090): аутентификация по заголовку X-Api-Key, ставит tenant-контекст. */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ApiKeyRequest>();
    const header = request.headers['x-api-key'];
    const key = typeof header === 'string' ? header : undefined;
    if (!key) throw new UnauthorizedException('Нужен заголовок X-Api-Key');
    const auth = await this.apiKeysService.authenticate(key);
    if (!auth) throw new UnauthorizedException('Неверный или отозванный API-ключ');
    request.tenantId = auth.tenantId;
    request.apiKeyId = auth.apiKeyId;
    return true;
  }
}
