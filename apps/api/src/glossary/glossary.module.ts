import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { GlossaryController } from './glossary.controller';
import { GlossaryService } from './glossary.service';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [GlossaryController],
  providers: [GlossaryService],
})
export class GlossaryModule {}
