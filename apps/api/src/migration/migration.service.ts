import { Injectable } from '@nestjs/common';
import { parseChecklistWorkbook } from './checklist-workbook';

/** Импорт исторических данных (EP-MIGRATE, T-H12). Пока dry-run превью парсинга. */
@Injectable()
export class MigrationService {
  /** Разобрать загруженный чеклист-шаблон (.xlsx) → строки-контроли (без создания сущностей). */
  async previewChecklist(buffer: Buffer) {
    const rows = await parseChecklistWorkbook(buffer);
    return { count: rows.length, rows };
  }
}
