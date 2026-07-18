#!/usr/bin/env node
/**
 * Гвард полноты i18n (T-A17, Трек A2): en/ru/az должны иметь идентичный набор
 * ключей. Падает с кодом 1 при любом расхождении — подключается в /verify и CI.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const LOCALES = ['en', 'ru', 'az'];
const msgDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'messages');

const load = (l) => JSON.parse(readFileSync(join(msgDir, `${l}.json`), 'utf8'));
const leafPaths = (obj, pre = '') =>
  Object.entries(obj).flatMap(([k, v]) => {
    const p = pre ? `${pre}.${k}` : k;
    return v && typeof v === 'object' && !Array.isArray(v) ? leafPaths(v, p) : [p];
  });

const data = Object.fromEntries(LOCALES.map((l) => [l, new Set(leafPaths(load(l)))]));
const base = data.en;
const problems = [];
for (const l of LOCALES) {
  if (l === 'en') continue;
  for (const k of base) if (!data[l].has(k)) problems.push(`${l} отсутствует: ${k}`);
  for (const k of data[l]) if (!base.has(k)) problems.push(`${l} лишний: ${k}`);
}

const sizes = LOCALES.map((l) => `${l}=${data[l].size}`).join(' ');
if (problems.length) {
  console.error(`❌ i18n рассинхрон (${sizes}):`);
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log(`✅ i18n паритет: ${sizes}, ключей ${base.size}`);
