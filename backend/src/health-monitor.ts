import nodemailer from 'nodemailer';
import { config } from './config';

let lastConnected: boolean | null = null;
let running = false;
const mailer = config.SMTP_USER && config.SMTP_APP_PASSWORD
  ? nodemailer.createTransport({ host: config.SMTP_HOST, port: config.SMTP_PORT, secure: config.SMTP_PORT === 465, requireTLS: config.SMTP_PORT === 587, auth: { user: config.SMTP_USER, pass: config.SMTP_APP_PASSWORD } })
  : null;

async function sendAlert(message: { subject: string; text: string }) {
  if (!mailer || !config.ALERT_EMAIL_TO) return;
  try { await mailer.sendMail({ from: config.SMTP_USER, to: config.ALERT_EMAIL_TO, ...message }); }
  catch (error) { console.error('WhatsApp status alert email failed:', error instanceof Error ? error.message : 'unknown error'); }
}

async function check() {
  if (running || !config.OPENWA_BASE_URL) return;
  running = true;
  try {
    const response = await fetch(`${config.OPENWA_BASE_URL}/health`, { headers: config.OPENWA_API_TOKEN ? { 'X-API-Key': config.OPENWA_API_TOKEN } : {}, signal: AbortSignal.timeout(8_000) });
    const value = response.ok ? await response.json() as { connected?: boolean; session?: { ready?: boolean } } : {};
    const connected = response.ok && value.connected === true && value.session?.ready === true;
    if (lastConnected !== null && lastConnected !== connected) {
      await sendAlert({ subject: connected ? 'FunnelLens: WhatsApp terhubung kembali' : 'FunnelLens: sesi WhatsApp terputus', text: connected ? 'Sesi OpenWA FunnelLens sudah siap kembali.' : 'Sesi OpenWA FunnelLens terputus. Buka dashboard OpenWA dan tautkan ulang jika diperlukan.' });
    }
    lastConnected = connected;
  } catch (error) {
    if (lastConnected === true) {
      await sendAlert({ subject: 'FunnelLens: gateway WhatsApp tidak dapat dijangkau', text: `Health check OpenWA gagal: ${error instanceof Error ? error.message : 'unknown error'}` });
    }
    lastConnected = false;
  } finally { running = false; }
}

export function startOpenWaMonitor() {
  void check();
  const timer = setInterval(() => void check(), 60_000);
  return () => clearInterval(timer);
}
