import { z } from 'zod';

const optionalUrl = z.union([z.literal(''), z.string().url()]).default('');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CORS_ORIGIN: z.string().default('http://127.0.0.1:5173'),
  TRACKER_ALLOWED_ORIGINS: z.string().default(''),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL wajib diisi'),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DATABASE_SSL: z.enum(['disable', 'require']).default('disable'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  OWNER_AUTH_SUBJECT: z.string().uuid(),
  PII_ENCRYPTION_KEY: z.string().min(43),
  PII_HMAC_KEY: z.string().min(43),
  CREDENTIAL_ENCRYPTION_KEY: z.string().min(43),
  FRONTEND_ORIGIN: z.string().url().default('http://127.0.0.1:5173'),
  OPENWA_BASE_URL: optionalUrl,
  OPENWA_API_TOKEN: z.string().default(''),
  OPENWA_AUTO_REPLY_TEXT: z.string().max(1000).default(''),
  OPENWA_WEBHOOK_SECRET: z.string().default(''),
  BACKEND_PUBLIC_URL: z.string().url().default('http://api:3000'),
  OLLAMA_BASE_URL: optionalUrl,
  LOCAL_AI_MODEL: z.string().default('qwen2.5:0.5b'),
  EXTERNAL_AI_BASE_URL: optionalUrl,
  EXTERNAL_AI_API_KEY: z.string().default(''),
  EXTERNAL_AI_MODEL: z.string().default(''),
  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: z.string().default(''),
  SMTP_APP_PASSWORD: z.string().default(''),
  ALERT_EMAIL_TO: z.string().default(''),
  META_APP_ID: z.string().default(''),
  META_APP_SECRET: z.string().default(''),
  META_API_VERSION: z.string().default(''),
  META_REDIRECT_URI: z.string().default('http://127.0.0.1:3000/api/integrations/meta/callback'),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV === 'production' && env.OPENWA_WEBHOOK_SECRET.length < 32) {
    ctx.addIssue({ code: 'custom', path: ['OPENWA_WEBHOOK_SECRET'], message: 'Minimal 32 karakter di production' });
  }
});

const parsed = envSchema.safeParse(Bun.env);
if (!parsed.success) {
  console.error('Konfigurasi backend tidak valid:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
