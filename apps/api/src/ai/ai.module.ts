import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

/** @Global: AiService инъектируется где угодно (ассист поверх детерминированных фич). */
@Global()
@Module({
  imports: [AuthModule, RbacModule],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
