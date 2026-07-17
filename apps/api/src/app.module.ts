import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { InfraHealthController } from './infra-health.controller';
import { InfraHealthService } from './infra-health.service';
import { JobsModule } from './jobs/jobs.module';

@Module({
  imports: [JobsModule],
  controllers: [HealthController, InfraHealthController],
  providers: [InfraHealthService],
})
export class AppModule {}
