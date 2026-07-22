import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';
import { RbacModule } from '../rbac/rbac.module';
import { EngagementsController } from './engagements.controller';
import { EngagementsService } from './engagements.service';

@Module({
  imports: [AuthModule, RbacModule, CustomFieldsModule],
  controllers: [EngagementsController],
  providers: [EngagementsService],
})
export class EngagementsModule {}
