import { Module } from '@nestjs/common';
import { FileStorageService } from './file-storage.service';
import { FilesController } from './files.controller';

@Module({
  controllers: [FilesController],
  providers: [FileStorageService],
  exports: [FileStorageService],
})
export class FilesModule {}
