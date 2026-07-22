import { Module } from '@nestjs/common';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { ReportDataService } from '../reports/report-data.service';
import { ApiV1Controller } from './api-v1.controller';

@Module({
  imports: [ApiKeysModule],
  controllers: [ApiV1Controller],
  providers: [ReportDataService],
})
export class ApiV1Module {}
