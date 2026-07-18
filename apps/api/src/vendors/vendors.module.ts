import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { VendorAssessmentsService } from './vendor-assessments.service';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [VendorsController],
  providers: [VendorsService, VendorAssessmentsService],
})
export class VendorsModule {}
