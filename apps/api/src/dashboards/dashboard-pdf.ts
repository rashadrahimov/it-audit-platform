import { existsSync } from 'node:fs';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';

/**
 * PDF-экспорт чарт-дашборда (T-V15): pdfkit, честный рендер chartType —
 * bar (горизонтальные бары), pie/donut (секторы), line (полилиния), number (крупное число).
 * Шрифт DejaVu — кириллица/AZ-латиница (как в report-renderers).
 */

export interface WidgetData {
  title: string;
  chartType: string;
  data: Record<string, number>;
}

function fontPath(file: string): string {
  const candidates = [
    join(__dirname, '..', 'assets', 'fonts', file), // dist/assets/fonts
    join(__dirname, '..', '..', 'assets', 'fonts', file), // apps/api/assets/fonts (dev)
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`Шрифт ${file} не найден: ${candidates.join(', ')}`);
  return found;
}

const KEY_COLORS: Record<string, string> = {
  critical: '#dc2626',
  high: '#ea580c',
  non_compliant: '#dc2626',
  overdue: '#dc2626',
  fail: '#dc2626',
  medium: '#d97706',
  due_soon: '#d97706',
  low: '#059669',
  compliant: '#059669',
  ok: '#059669',
  pass: '#059669',
};
const PALETTE = ['#2563eb', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#f59e0b', '#475569'];

const colorOf = (key: string, i: number) => KEY_COLORS[key] ?? PALETTE[i % PALETTE.length]!;

function drawPie(
  doc: InstanceType<typeof PDFDocument>,
  entries: Array<[string, number]>,
  x: number,
  y: number,
  r: number,
  donut: boolean,
) {
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
  let angle = -Math.PI / 2;
  entries.forEach(([key, value], i) => {
    const slice = (value / total) * Math.PI * 2;
    const end = angle + slice;
    const large = slice > Math.PI ? 1 : 0;
    const x1 = x + r * Math.cos(angle);
    const y1 = y + r * Math.sin(angle);
    const x2 = x + r * Math.cos(end);
    const y2 = y + r * Math.sin(end);
    doc
      .path(`M ${x} ${y} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`)
      .fill(colorOf(key, i));
    angle = end;
  });
  if (donut) doc.circle(x, y, r * 0.55).fill('#ffffff');
}

function drawLine(
  doc: InstanceType<typeof PDFDocument>,
  entries: Array<[string, number]>,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const max = Math.max(1, ...entries.map(([, v]) => v));
  const step = entries.length > 1 ? w / (entries.length - 1) : 0;
  doc.moveTo(x, y + h - (entries[0]![1] / max) * h);
  entries.forEach(([, v], i) => doc.lineTo(x + i * step, y + h - (v / max) * h));
  doc.lineWidth(1.5).stroke('#2563eb');
}

export function toDashboardPdf(input: { name: string; widgets: WidgetData[] }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      doc.registerFont('body', fontPath('DejaVuSans.ttf'));
      doc.registerFont('bold', fontPath('DejaVuSans-Bold.ttf'));
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.font('bold').fontSize(18).text(input.name);
      doc.font('body').fontSize(9).fillColor('#475569').text('STATERA · dashboard export');
      doc.fillColor('#000000');

      for (const w of input.widgets) {
        // виджет не должен рваться между страницами без нужды
        const needed = 60 + Math.max(Object.keys(w.data).length * 16, 90);
        if (doc.y + needed > doc.page.height - 40) doc.addPage();
        doc.moveDown(1);
        doc.font('bold').fontSize(12).text(`${w.title}  ·  ${w.chartType}`);
        doc.moveDown(0.4);
        const entries = Object.entries(w.data);
        const top = doc.y;
        if (entries.length === 0) {
          doc.font('body').fontSize(10).text('—');
          continue;
        }
        if (w.chartType === 'number') {
          const total = entries.reduce((s, [, v]) => s + v, 0);
          doc.font('bold').fontSize(28).text(String(total));
          doc.font('body').fontSize(9).fillColor('#475569');
          doc.text(entries.map(([k, v]) => `${k}: ${v}`).join('   '));
          doc.fillColor('#000000');
        } else if (w.chartType === 'pie' || w.chartType === 'donut') {
          const r = 42;
          drawPie(doc, entries, 40 + r, top + r, r, w.chartType === 'donut');
          doc.fillColor('#000000');
          entries.forEach(([key, value], i) => {
            const ly = top + i * 14;
            doc.rect(150, ly + 2, 8, 8).fill(colorOf(key, i));
            doc
              .fillColor('#000000')
              .font('body')
              .fontSize(9)
              .text(`${key}: ${value}`, 164, ly, { lineBreak: false });
          });
          doc.y = Math.max(top + r * 2, top + entries.length * 14) + 6;
          doc.x = 40;
        } else if (w.chartType === 'line') {
          drawLine(doc, entries, 40, top, 220, 60);
          doc.fillColor('#000000').font('body').fontSize(8);
          doc.text(entries.map(([k, v]) => `${k}: ${v}`).join('   '), 40, top + 66, {
            width: 500,
          });
          doc.moveDown(0.5);
          doc.x = 40;
        } else {
          // bar (дефолт): горизонтальные бары со значениями
          const max = Math.max(1, ...entries.map(([, v]) => v));
          entries.forEach(([key, value], i) => {
            const ly = top + i * 16;
            doc.font('body').fontSize(9).fillColor('#000000');
            doc.text(key, 40, ly, { width: 130, lineBreak: false });
            doc.rect(175, ly + 1, (value / max) * 250, 8).fill(colorOf(key, i));
            doc
              .fillColor('#000000')
              .text(String(value), 175 + (value / max) * 250 + 6, ly, { lineBreak: false });
          });
          doc.y = top + entries.length * 16 + 4;
          doc.x = 40;
        }
      }

      doc.end();
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
