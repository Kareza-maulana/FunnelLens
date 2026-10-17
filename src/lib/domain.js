export const STORAGE_KEY = 'funnellens:workspace:v1';
export const money = (n = 0) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n) || 0);
export const number = (n = 0) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(n);
export const percent = (n = 0) => `${number(n * 100)}%`;
export const shortMoney = n => n >= 1000000 ? `Rp${number(n / 1000000)} jt` : money(n);
export const uid = () => globalThis.crypto?.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
export const STEPS = ['Profil bisnis', 'Branding & posisi', 'Campaign pertama', 'Strategi & creative', 'Koneksi Meta', 'Review & kirim'];
export const SAMPLE = { name: 'Toko Nusa', category: 'Peralatan rumah tangga', product: 'Sikat elektrik mini', price: 149000, benefits: '3 kepala sikat; isi ulang USB', audience: 'Penghuni kos & rumah kecil', area: 'Bandung dan sekitarnya', photo: '', variants: [] };
export function createWorkspace() {
  return { version: 1, business: { name: '', category: '', product: '', price: '', benefits: '', audience: '', area: '', photo: '', variants: [] }, brand: { mode: 'ai', name: '', tagline: '', positioning: '', tone: 'Ramah, lugas, praktis', colors: ['#2874ff', '#10b7af'], preference: 'Praktis, ramah', emphasis: '', options: [], selectedId: null, round: 0, logo: '' }, campaign: { name: '', objective: 'Leads', goal: 'Dapatkan lead', destination: 'wa', phone: '', location: '', ageMin: 18, ageMax: 55, budget: 700000, start: '2026-10-24', end: '2026-10-30', lpMode: 'template', lpUrl: '', lpHeadline: '', lpFields: ['Nama', 'Nomor HP', 'Kebutuhan'], creative: '' }, meta: { connected: false, account: 'Toko Nusa Ads', page: '', whatsapp: '' }, onboarding: { maxStep: 1, completed: false, brandView: 'input' }, execution: { status: 'draft', progress: 0, receiptId: null, scenario: 'success', approvedSnapshot: null }, receipts: [], preferences: { period: 'sep', campaign: 'all' }, leadOverrides: {}, leadNotes: {}, insightOverrides: {}, creativeDrafts: [], controlOverrides: {}, strategy: { proposed: { prospecting: 10000000, retargeting: 10000000, wa: 4000000 }, history: [] }, integrationDemo: { wa: false, lp: false } };
}
export function mergeWorkspace(input) {
  if (!input || input.version !== 1 || typeof input.business !== 'object' || !input.business) throw new Error('Format workspace tidak dikenali. Gunakan file ekspor FunnelLens.');
  const base = createWorkspace();
  const check = (value, model, path) => {
    if (value === undefined || model === null) return;
    if (Array.isArray(model)) { if (!Array.isArray(value)) throw Error(`Format ${path} tidak valid.`); return; }
    if (typeof model === 'object') { if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(`Format ${path} tidak valid.`); for (const key of Object.keys(model)) check(value[key], model[key], `${path}.${key}`); }
    else if (typeof model === 'string' && typeof value !== 'string' && !['price'].includes(path.split('.').at(-1))) throw Error(`Format ${path} tidak valid.`);
    else if (typeof model === 'boolean' && typeof value !== 'boolean') throw Error(`Format ${path} tidak valid.`);
    else if (typeof model === 'number' && !Number.isFinite(Number(value))) throw Error(`Format ${path} tidak valid.`);
  };
  check(input, base, 'workspace');
  const out = { ...base };
  for (const key of Object.keys(base)) {
    if (input[key] === undefined) continue;
    if (Array.isArray(base[key])) out[key] = Array.isArray(input[key]) ? input[key] : base[key];
    else if (base[key] && typeof base[key] === 'object') out[key] = { ...base[key], ...(typeof input[key] === 'object' && input[key] ? input[key] : {}) };
    else out[key] = input[key];
  }
  out.version = 1;
  out.onboarding.maxStep = Math.max(1, Math.min(6, Number(out.onboarding.maxStep) || 1));
  if (!Array.isArray(out.business.variants)) out.business.variants = [];
  if (!Array.isArray(out.brand.colors)) out.brand.colors = base.brand.colors;
  if (!Array.isArray(out.brand.options)) out.brand.options = [];
  out.brand.colors = out.brand.colors.filter(c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c));
  if (!out.brand.colors.length) out.brand.colors = base.brand.colors;
  for (const item of out.brand.options) { if (!item || typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.positioning !== 'string' || !Array.isArray(item.colors)) throw Error('Konsep brand pada file tidak valid.'); }
  for (const item of out.business.variants) { if (!item || typeof item.name !== 'string' || !(Number(item.price) > 0)) throw Error('Varian produk pada file tidak valid.'); }
  for (const item of out.receipts) { if (!item || typeof item.id !== 'string' || typeof item.name !== 'string') throw Error('Riwayat campaign pada file tidak valid.'); }
  for (const item of out.creativeDrafts) { if (!item || typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.angle !== 'string') throw Error('Draft creative pada file tidak valid.'); }
  if (!['sep', 'aug', 'jul'].includes(out.preferences.period)) out.preferences.period = 'sep';
  if (!['all', 'prospecting', 'retargeting', 'wa'].includes(out.preferences.campaign)) out.preferences.campaign = 'all';
  if (!['wa', 'lp', 'both'].includes(out.campaign.destination)) throw Error('Destinasi campaign tidak valid.');
  out.strategy.proposed = { ...base.strategy.proposed, ...out.strategy.proposed };
  out.strategy.history = Array.isArray(out.strategy.history) ? out.strategy.history : [];
  return out;
}
export function loadWorkspace(storage) {
  try { const raw = storage.getItem(STORAGE_KEY); return { workspace: raw ? mergeWorkspace(JSON.parse(raw)) : createWorkspace(), error: '' }; }
  catch { return { workspace: createWorkspace(), error: 'Data tersimpan tidak dapat dibaca. Anda bisa memulihkan file ekspor atau memulai draft baru.' }; }
}
export function saveWorkspace(storage, workspace) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(workspace)); return ''; }
  catch { return 'Penyimpanan browser penuh atau diblokir. Ekspor workspace agar perubahan Anda tidak hilang.'; }
}
export function clearWorkspace(storage) { storage.removeItem(STORAGE_KEY); }
export function daysBetween(start, end) {
  const a = Date.parse(`${start}T00:00:00Z`), b = Date.parse(`${end}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.round((b - a) / 86400000) + 1) : 0;
}
export function validateStep(step, w) {
  const e = {}, b = w.business, c = w.campaign;
  if (step === 1) { ['name', 'category', 'product', 'benefits', 'audience', 'area'].forEach(k => { if (!String(b[k] || '').trim()) e[k] = 'Bagian ini perlu diisi.'; }); if (!(Number(b.price) > 0)) e.price = 'Masukkan harga lebih besar dari 0.'; }
  if (step === 2) { if (!w.brand.name.trim()) e.brandName = 'Pilih konsep atau isi nama brand.'; if (!w.brand.positioning.trim()) e.positioning = 'Jelaskan posisi brand Anda.'; }
  if (step === 3) {
    if (!c.name.trim()) e.campaignName = 'Isi nama campaign.';
    if (!c.location.trim()) e.location = 'Tentukan wilayah audiens.';
    if (!(Number(c.budget) >= 10000)) e.budget = 'Budget demo minimal Rp10.000.';
    if (daysBetween(c.start, c.end) < 1) e.schedule = 'Tanggal akhir tidak boleh sebelum tanggal mulai.';
    if (!Number.isFinite(Number(c.ageMin)) || !Number.isFinite(Number(c.ageMax)) || Number(c.ageMin) < 18 || Number(c.ageMax) > 65 || Number(c.ageMin) > Number(c.ageMax)) e.age = 'Gunakan rentang usia 18–65 yang valid.';
    if (c.destination !== 'lp' && !/^\+?[\d\s-]{9,18}$/.test(c.phone)) e.phone = 'Masukkan nomor bisnis yang valid, misalnya 081234567890.';
    if (c.destination !== 'wa' && c.lpMode === 'existing') { try { const u = new URL(c.lpUrl); if (!['http:', 'https:'].includes(u.protocol)) throw Error(); } catch { e.lpUrl = 'Gunakan URL http atau https yang valid.'; } }
    if (c.destination !== 'wa' && c.lpMode === 'template' && !c.lpHeadline.trim()) e.lpHeadline = 'Isi headline LP demo.';
  }
  if (step === 4 && !c.creative.trim()) e.creative = 'Isi teks iklan sebelum melanjutkan.';
  if (step === 5) { if (!w.meta.connected) e.meta = 'Hubungkan akun simulasi terlebih dahulu.'; else if (!w.meta.account.trim() || !w.meta.page.trim() || (c.destination !== 'lp' && !/^\+?[\d\s-]{9,18}$/.test(w.meta.whatsapp))) e.meta = 'Lengkapi akun, halaman, dan nomor WhatsApp simulasi yang valid.'; }
  return e;
}
export function draftFingerprint(w) { return JSON.stringify({ business: w.business, brand: w.brand, campaign: w.campaign, meta: w.meta }); }
export function canSubmit(w, consent) { return !!consent && [1, 2, 3, 4, 5].every(s => Object.keys(validateStep(s, w)).length === 0) && w.execution.status !== 'sending'; }
export function generateBrands(business, round = 0) {
  const raw = (business.name || 'Nusa').replace(/^(toko|cv|pt|kedai)\s+/i, '').trim().split(' ')[0] || 'Nusa';
  const product = business.product || 'produk Anda';
  const sets = [['Bersih', 'Rapi', 'Praktis'], ['Harian', 'Ringkas', 'Nyaman'], ['Pilih', 'Ruang', 'Mudah']];
  const suffix = sets[round % sets.length];
  return [
    { id: `${round}-0`, name: `${raw}${suffix[0]}`, tagline: round ? 'Praktis untuk setiap hari' : 'Beres tanpa ribet', positioning: `${product} praktis untuk ${business.audience || 'kebutuhan sehari-hari'}`, tone: 'Ramah, lugas, praktis', colors: ['#2874ff', '#10b7af'] },
    { id: `${round}-1`, name: `${raw}${suffix[1]}`, tagline: 'Rutinitas ringan, ruang lebih nyaman', positioning: `${product} dengan pendekatan sederhana untuk ${business.audience || 'pelanggan Anda'}`, tone: 'Tenang, ringkas, hangat', colors: ['#ead9c8', '#11274b'] },
    { id: `${round}-2`, name: `${raw}${suffix[2]}`, tagline: 'Pilihan untuk kebutuhan harian', positioning: `Pilihan ${product.toLowerCase()} untuk kebutuhan ${business.audience || 'harian'}`, tone: 'Akrab, langsung, optimistis', colors: ['#9fb7a6', '#152b46'] }
  ];
}
export function csv(rows) { return '\uFEFF' + rows.map(row => row.map(v => `"${String(v ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n'); }
export function download(name, content, type = 'application/json') {
  const blob = new Blob([content], { type }), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 500);
}
