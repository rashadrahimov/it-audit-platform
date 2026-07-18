import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { env } from '../env';

/**
 * Шифрование конфига коннектора (T-048, ADR-0011): креды внешних систем не должны
 * лежать в БД открыто. AES-256-GCM; ключ — из ENCRYPTION_KEY (scrypt-производная,
 * чтобы принять ключ любой длины). Формат хранения: iv:authTag:ciphertext (hex).
 */
const key = scryptSync(env.encryptionKey, 'it-audit-connector', 32);

export function encryptConfig(config: Record<string, unknown>): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(config), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('hex'), authTag.toString('hex'), ciphertext.toString('hex')].join(':');
}

export function decryptConfig(stored: string): Record<string, unknown> {
  const [ivHex, tagHex, dataHex] = stored.split(':');
  if (!ivHex || !tagHex || !dataHex) throw new Error('Повреждённый config_encrypted');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8')) as Record<string, unknown>;
}
