import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { UniverseModule } from '../universe/universe.module';
import { ProcessesController } from './processes.controller';
import { ProcessesService } from './processes.service';

@Module({
  imports: [AuthModule, RbacModule, UniverseModule],
  controllers: [ProcessesController],
  providers: [ProcessesService],
})
export class ProcessesModule {}
