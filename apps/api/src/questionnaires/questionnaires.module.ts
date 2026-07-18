import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { QuestionnairesController } from './questionnaires.controller';
import { QuestionnairesService } from './questionnaires.service';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [QuestionnairesController],
  providers: [QuestionnairesService],
})
export class QuestionnairesModule {}
