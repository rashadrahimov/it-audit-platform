import { Global, Module } from '@nestjs/common';
import { DbService } from './db.service';

/** Global: доступ к БД нужен почти каждому модулю — без импорт-шума. */
@Global()
@Module({
  providers: [DbService],
  exports: [DbService],
})
export class DbModule {}
