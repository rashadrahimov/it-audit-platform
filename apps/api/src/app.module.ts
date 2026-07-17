import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { InfraHealthController } from './infra-health.controller';
import { InfraHealthService } from './infra-health.service';
import { EmailModule } from './email/email.module';
import { FilesModule } from './files/files.module';
import { JobsModule } from './jobs/jobs.module';

@Module({
  imports: [EmailModule, FilesModule, JobsModule],
  controllers: [HealthController, InfraHealthController],
  providers: [InfraHealthService],
})
export class AppModule {}
