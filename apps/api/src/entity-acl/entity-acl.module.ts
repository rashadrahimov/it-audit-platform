import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { EntityAclController } from './entity-acl.controller';
import { EntityAclService } from './entity-acl.service';

/** T-V48 (ADR-0021): per-entity ACL «Manage access». */
@Module({
  imports: [AuthModule, RbacModule],
  controllers: [EntityAclController],
  providers: [EntityAclService],
  exports: [EntityAclService],
})
export class EntityAclModule {}
