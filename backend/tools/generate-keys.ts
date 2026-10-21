import { randomBytes } from 'node:crypto';

console.log(`PII_ENCRYPTION_KEY=${randomBytes(32).toString('base64url')}`);
console.log(`PII_HMAC_KEY=${randomBytes(32).toString('base64url')}`);
console.log(`CREDENTIAL_ENCRYPTION_KEY=${randomBytes(32).toString('base64url')}`);
