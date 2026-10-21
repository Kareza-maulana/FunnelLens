const backendUrl = process.env.BACKEND_PUBLIC_URL || 'http://api:3000';

export default {
  host: '0.0.0.0',
  port: Number(process.env.WA_PORT || 8080),
  sessionId: process.env.WA_SESSION_ID || 'funnellens',
  userDataDir: process.env.WA_USER_DATA_DIR || '/sessions/funnellens',
  apiKey: process.env.WA_API_KEY,
  plugins: ['@open-wa/integration-webhook'],
  pluginConfig: {
    webhook: {
      url: `${backendUrl.replace(/\/$/, '')}/api/webhooks/openwa`,
      events: ['message.received'],
      headers: { 'X-Webhook-Secret': process.env.OPENWA_WEBHOOK_SECRET },
    },
  },
};
