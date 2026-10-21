import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { config } from './config';

function decodeKey(value: string) {
  const key = Buffer.from(value, 'base64url');
  if (key.length !== 32) throw new Error('Kunci PII harus 32 byte dalam format base64url.');
  return key;
}

export function protectPii(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', decodeKey(config.PII_ENCRYPTION_KEY), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return { ciphertext: Buffer.concat([iv, cipher.getAuthTag(), ciphertext]), hmac: createHmac('sha256', decodeKey(config.PII_HMAC_KEY)).update(value).digest('hex') };
}

export function protectSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', decodeKey(config.CREDENTIAL_ENCRYPTION_KEY), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

export function revealPii(value: Buffer) {
  const decipher = createDecipheriv('aes-256-gcm', decodeKey(config.PII_ENCRYPTION_KEY), value.subarray(0, 12));
  decipher.setAuthTag(value.subarray(12, 28));
  return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString('utf8');
}

export function revealSecret(value: Buffer) {
  const decipher = createDecipheriv('aes-256-gcm', decodeKey(config.CREDENTIAL_ENCRYPTION_KEY), value.subarray(0, 12));
  decipher.setAuthTag(value.subarray(12, 28));
  return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString('utf8');
}

export function maskPii(text: string) {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]')
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, '[PHONE]');
}
