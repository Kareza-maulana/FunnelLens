export const PERIODS = { sep: { label: '1–30 Sep 2026', factor: 1 }, aug: { label: '1–31 Agu 2026', factor: .84 }, jul: { label: '1–31 Jul 2026', factor: .72 } };
export const CAMPAIGNS = [
  { id: 'prospecting', name: 'Prospecting', role: 'TOFU–MOFU', segment: 'Cold', spend: 12000000, planned: 14000000, impressions: 600000, clicks: 24000, ql: 240, profiles: [4000, 1400, 540, 60], levels: [3300, 1800, 900], customers: 60, status: 'active' },
  { id: 'retargeting', name: 'Retargeting', role: 'MOFU–BOFU', segment: 'Warm', spend: 8000000, planned: 6000000, impressions: 200000, clicks: 16000, ql: 320, profiles: [700, 1100, 1100, 100], levels: [600, 1400, 1000], customers: 100, status: 'active' },
  { id: 'wa', name: 'WA Direct', role: 'BOFU–Action', segment: 'Mixed', spend: 4000000, planned: 4000000, impressions: 100000, clicks: 8000, ql: 160, profiles: [300, 300, 380, 20], levels: [300, 400, 300], customers: 20, status: 'active' }
];
export const STAGES = [{ id: 'tofu', name: 'TOFU', title: 'Awareness', signal: 'Sinyal awal tercatat' }, { id: 'mofu', name: 'MOFU', title: 'Interest', signal: 'Interaksi bermakna' }, { id: 'bofu', name: 'BOFU', title: 'Desire', signal: 'Niat beli tercatat' }, { id: 'action', name: 'Action', title: 'Transaksi tercatat', signal: 'Transaksi berhasil ditautkan' }];
export function campaignData(campaign = 'all', period = 'sep') {
  const f = PERIODS[period]?.factor ?? 1;
  return CAMPAIGNS.filter(c => campaign === 'all' || c.id === campaign).map(c => ({ ...c, spend: Math.round(c.spend * f), planned: Math.round(c.planned * f), impressions: Math.round(c.impressions * f), clicks: Math.round(c.clicks * f), ql: Math.round(c.ql * f), profiles: c.profiles.map(v => Math.round(v * f)), levels: c.levels.map(v => Math.round(v * f)), customers: Math.round(c.customers * f) }));
}
export function totals(rows) { return rows.reduce((a, c) => ({ spend: a.spend + c.spend, impressions: a.impressions + c.impressions, clicks: a.clicks + c.clicks, ql: a.ql + c.ql, customers: a.customers + c.customers }), { spend: 0, impressions: 0, clicks: 0, ql: 0, customers: 0 }); }
export const CREATIVES = [
  { id: 'demo-a', name: 'Demo produk A', campaign: 'retargeting', segment: 'Warm', format: 'Video', angle: 'Product demo', spend: 4000000, clicks: 1000, impressions: 20000, ql: 200, caption: 'Beres tanpa ribet. Lihat cara sikat mini membersihkan sudut sempit.', color: 'blue', finding: 'Lebih hemat per QL dalam Retargeting.' },
  { id: 'social-b', name: 'Social proof B', campaign: 'retargeting', segment: 'Warm', format: 'Image', angle: 'Social proof', spend: 4000000, clicks: 1000, impressions: 25000, ql: 120, caption: 'Rutinitas bersih yang lebih praktis untuk ruang kecil.', color: 'sage', finding: 'Biaya/QL lebih tinggi dibanding Demo A pada scope yang sama.' },
  { id: 'promo-c', name: 'Promo C', campaign: 'prospecting', segment: 'Cold', format: 'Image', angle: 'Offer', spend: 3200000, clicks: 1000, impressions: 50000, ql: 40, caption: 'Kenali alat praktis untuk kebutuhan bersih sehari-hari.', color: 'sand', finding: 'Uji kejelasan manfaat untuk audiens cold.' },
  { id: 'demo-d', name: 'Demo produk D', campaign: 'prospecting', segment: 'Cold', format: 'Video', angle: 'Product demo', spend: 4800000, clicks: 2000, impressions: 80000, ql: 120, caption: 'Tiga kepala sikat untuk rutinitas yang berbeda.', color: 'blue', finding: 'Bandingkan variasi hook pada segmen cold.' },
  { id: 'social-e', name: 'Panduan harian E', campaign: 'prospecting', segment: 'Cold', format: 'Carousel', angle: 'Educational', spend: 4000000, clicks: 1600, impressions: 64000, ql: 80, caption: 'Mulai dari satu sudut kecil setiap hari.', color: 'sage', finding: 'Pelajari respons terhadap angle edukasi.' },
  { id: 'wa-f', name: 'Percakapan F', campaign: 'wa', segment: 'Hot', format: 'Image', angle: 'Product benefit', spend: 4000000, clicks: 2000, impressions: 50000, ql: 160, caption: 'Punya pertanyaan? Tanyakan kebutuhan Anda lewat WhatsApp.', color: 'sand', finding: 'Tinjau kualitas percakapan, bukan klik saja.' }
];
const firstNames = ['Alya', 'Bima', 'Citra', 'Deni', 'Eka', 'Fajar', 'Gita', 'Hadi', 'Intan', 'Joko', 'Karin', 'Laras', 'Maya', 'Nanda', 'Oki', 'Putri', 'Raka', 'Sinta', 'Tara', 'Wira'];
const lastNames = ['Putri', 'Pratama', 'Lestari', 'Saputra', 'Wulandari', 'Ramadhan', 'Maharani', 'Santoso', 'Permata', 'Wijaya'];
const specs = [{ campaign: 'prospecting', source: 'wa', counts: [12, 16, 8] }, { campaign: 'prospecting', source: 'lp', counts: [10, 9, 5] }, { campaign: 'retargeting', source: 'wa', counts: [2, 6, 4] }, { campaign: 'retargeting', source: 'lp', counts: [1, 4, 3] }, { campaign: 'wa', source: 'wa', counts: [3, 7, 6] }];
export const LEADS = specs.flatMap((spec, si) => {
  let n = 0;
  return spec.counts.flatMap((count, li) => Array.from({ length: count }, () => {
    const i = n++, level = ['Cold', 'Warm', 'Hot'][li], id = `lead-${si}-${i}`;
    const name = `${firstNames[(i + si * 4) % firstNames.length]} ${lastNames[(i + si) % lastNames.length]}`;
    return { id, name, phone: `081200${String(si + 1).padStart(2, '0')}${String(i + 101).padStart(4, '0')}`, campaign: spec.campaign, source: spec.source, level, date: `2026-09-${String(24 + i % 7).padStart(2, '0')}`, signal: level === 'Hot' ? (spec.source === 'wa' ? 'Minta 20 unit minggu ini' : 'Minta penawaran 10 unit') : level === 'Warm' ? 'Membandingkan fitur dan kebutuhan' : 'Meminta informasi umum', stage: li === 0 ? 0 : li === 1 ? 1 : i % 6 === 0 ? 3 : 2, linked: i % 7 === 0 };
  }));
});
// Named exemplars share the same cohort as the approved onboarding-independent lead demo.
const waPros = LEADS.filter(l => l.campaign === 'prospecting' && l.source === 'wa');
Object.assign(waPros[28], { name: 'Alya Putri' });
Object.assign(waPros[12], { name: 'Bima Pratama' });
Object.assign(waPros[0], { name: 'Citra Lestari' });
const lpPros = LEADS.filter(l => l.campaign === 'prospecting' && l.source === 'lp');
Object.assign(lpPros[19], { name: 'Eka Wulandari' });
export const INSIGHTS = [
  { id: 'attribution', title: 'Atribusi 60 transaksi belum lengkap', type: 'Data parsial', domain: 'Business Impact', status: 'new', finding: '180 dari 240 transaksi pada dataset demo dapat ditautkan ke campaign.', impact: 'ROAS hanya mewakili revenue yang dapat diatribusikan.', hypothesis: 'Sebagian identitas atau sumber transaksi belum cocok.', recommendation: 'Periksa linkage transaksi sebelum menambah budget.', route: '/app/business', priority: 'Risiko keputusan' },
  { id: 'distribution', title: '78% profil berada di TOFU–MOFU', type: 'Teramati', domain: 'Funnel', status: 'reviewing', finding: '5.000 profil di Awareness dan 2.800 di Interest, dari 10.000 profil tertaut.', impact: 'Komposisi awal funnel dominan; kecukupannya bergantung strategi.', hypothesis: 'Campaign akuisisi menyumbang bagian terbesar profil. Ini bukan bukti kegagalan closing.', recommendation: 'Tinjau peran campaign dan sinyal BOFU sebelum mengubah alokasi.', route: '/app/funnel', priority: 'Konteks strategi' },
  { id: 'creative', title: 'Demo A layak diuji dengan variasi hook', type: 'Hipotesis uji', domain: 'Creative', status: 'new', finding: 'Demo A: Rp20.000/QL; Social B: Rp33.333/QL pada Retargeting/Warm.', impact: 'Ada arah eksperimen konten pada konteks campaign yang sama.', hypothesis: 'Demonstrasi penggunaan mungkin memudahkan pemahaman produk.', recommendation: 'Uji variasi pembuka; pertahankan fakta dan konteks segmen.', route: '/app/creative', priority: 'Peluang eksperimen' }
];
export const TRANSACTIONS = Array.from({ length: 240 }, (_, i) => ({ id: `TRX-${String(i + 1).padStart(4, '0')}`, amount: 500000, matched: i < 180, campaign: i < 60 ? 'prospecting' : i < 160 ? 'retargeting' : i < 180 ? 'wa' : null, date: `2026-09-${String(1 + i % 30).padStart(2, '0')}`, method: 'Klik 7 hari', identity: i < 180 ? 'Kontak & transaksi cocok' : 'Sumber belum dapat dipastikan' }));
export const TREND = [10, 12, 15, 14, 18, 21].map((revenue, i) => ({ date: `${1 + i * 5} Sep`, revenue, unknown: 5, leads: [90, 100, 110, 120, 140, 160][i] }));
export const levelColor = level => level === 'Cold' ? 'blue' : level === 'Warm' ? 'teal' : level === 'Hot' ? 'amber' : 'gray';
export const campaignName = id => CAMPAIGNS.find(c => c.id === id)?.name || id;
export function applyLeadOverrides(leads, overrides = {}) { return leads.map(l => ({ ...l, ...(overrides[l.id] || {}) })); }
