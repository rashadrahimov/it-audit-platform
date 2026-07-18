import { Module } from '@nestjs/common';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { ApiV1Controller } from './api-v1.controller';

@Module({
  imports: [ApiKeysModule],
  controllers: [ApiV1Controller],
})
export class ApiV1Module {}
