# FunnelLens Backend API & Services

Backend **FunnelLens** dibangun menggunakan **Bun 1.4+**, **TypeScript**, dan framework web **Elysia.js**. Layanan ini mengelola seluruh logika bisnis, enkripsi data pribadi (PII), sinkronisasi metrik iklan, integrasi WhatsApp, worker antrean (*background jobs*), serta inference AI lokal dan eksternal.

---

## 🏗️ Komponen Backend

1. **Elysia API Server**: Runtime ultra-cepat dengan validasi skema bertipe data tinggi (Zod / TypeBox).
2. **PostgreSQL Database Engine**:
   - Skema private `app` dengan 30 tabel dan SQL views (termasuk distribusi funnel as-of, direktori lead, metrik agregat iklan, dan business impact).
   - Dukungan extension `pgvector` untuk pencarian kemiripan dokumen knowledge base (RAG).
3. **In-Process Job Worker** (`src/worker.ts`):
   - Mengambil tugas melalui stored procedure `app.claim_job()`.
   - Menjalankan berbagai jenis tipe job: `execute` (pembuatan iklan Meta), `sync` (tarik data metrik harian), `embed` (vektorisasi dokumen), `analyze` (AI reasoning), dan `ingest` (pemrosesan event landing page/WhatsApp).
4. **Adapter Meta Ads & CAPI** (`src/meta-ads.ts`, `src/conversions.ts`):
   - Integrasi Graph API v22.0 untuk campaign, ad set, dan ad creative.
   - Pengiriman sinyal server-side conversion event (Meta CAPI) dengan hashing SHA-256 untuk attributed lead.
5. **WhatsApp Gateway & Health Monitor** (`src/integrations.ts`, `src/health-monitor.ts`):
   - Menerima webhook pesan masuk dari OpenWA engine.
   - Background worker yang memeriksa kesehatan sesi WhatsApp dan mengirimkan peringatan email via Google SMTP (Port 587/TLS) jika sesi terputus.
6. **Local & External AI Inference** (`src/ai.ts`):
   - Model lokal **Qwen 2.5 0.5B** via Ollama untuk klasifikasi intent pesan lead (<50ms) dan penyuntingan PII.
   - Model eksternal untuk pembuatan strategi campaign dan rekomendasi recalibration funnel.
7. **Keamanan & Privasi Data** (`src/pii.ts`, `src/erasure.ts`):
   - Enkripsi AES-256-GCM + blind index HMAC SHA-256 untuk semua data kontak (nama, nomor HP).
   - Endpoint penghapusan kontak untuk kepatuhan regulasi privasi (GDPR / Right to be Forgotten).

---

## 📋 Daftar Endpoint API

### 1. Sistem & Kesehatan
- `GET /health`: Cek kesehatan proses backend.
- `GET /ready`: Cek kesiapan koneksi database PostgreSQL.

### 2. Autentikasi & Workspace
- `GET /api/auth/me`: Verifikasi identitas dan status role akun owner.
- `GET /api/workspace`: Mengambil snapshot profil bisnis dan draft onboarding aktif.
- `PUT /api/workspace`: Menyimpan perubahan konfigurasi workspace owner.
- `DELETE /api/workspace`: Mereset workspace ke kondisi awal.

### 3. Integrasi & Saluran Data
- `GET /api/integrations`: Daftar status koneksi (Meta Ads, OpenWA, Landing Page).
- `POST /api/integrations/meta/oauth-url`: Menghasilkan URL OAuth Meta dengan anti-CSRF state token.
- `GET /api/integrations/meta/callback`: Menangani callback OAuth dan menyimpan token akses terenkripsi.
- `POST /api/integrations/whatsapp/verify`: Pengecekan aktif ke sesi OpenWA engine.
- `POST /api/integrations/landing-page/toggle`: Mengaktifkan atau menonaktifkan endpoint tracker landing page.

### 4. Manajemen Kampanye & Iklan
- `GET /api/campaigns`: Menampilkan daftar seluruh kampanye dan draft terkait.
- `POST /api/campaigns/drafts`: Membuat atau memperbarui draft kampanye baru.
- `POST /api/campaigns/drafts/:id/decide`: Memberikan keputusan approval/rejection owner (otomatis menjadwalkan eksekusi ke antrean job).

### 5. Analitik & Read Models
- `GET /api/analytics/overview`: Ringkasan metrik performa funnel bisnis.
- `GET /api/analytics/campaign-daily`: Metrik performa kampanye harian (impressions, clicks, spend).
- `GET /api/analytics/creative-daily`: Performa komparatif materi kreatif iklan.
- `GET /api/analytics/business-impact`: Laporan pendapatan riil vs biaya iklan harian.

### 6. Leads, Penilaian, & Konversi
- `GET /api/leads/directory`: Direktori lead terenkripsi dengan metadata sumber dan skor intent.
- `GET /api/leads/funnel-distribution`: Distribusi lead per tahap funnel (Awareness, Consideration, Intent, Purchase).
- `POST /api/conversions/purchase`: Mencatat transaksi pembelian terverifikasi dan mengirimkan sinyal Meta CAPI.
- `DELETE /api/contacts/:id/erasure`: Menghapus permanen dan menganonimkan data pribadi kontak (GDPR).

### 7. AI & Knowledge Base (RAG)
- `POST /api/ai/brand-suggestions`: Menghasilkan nama brand, positioning, dan tone-of-voice.
- `POST /api/ai/classify-intent`: Mengelompokkan pesan WhatsApp ke tahap funnel secara lokal via Qwen.
- `GET /api/ai/insights`: Menampilkan daftar rekomendasi AI yang siap direview.
- `POST /api/knowledge/documents`: Mengunggah dokumen pengetahuan baru untuk diproses oleh RAG engine.
- `POST /api/knowledge/search`: Melakukan pencarian vektor exact cosine similarity pada knowledge base.

### 8. Webhook Publik
- `POST /api/public/events`: Endpoint penerimaan sinyal interaksi dari script tracker landing page.
- `POST /api/public/leads`: Endpoint formulir pendaftaran lead landing page.
- `POST /api/public/webhooks/openwa`: Endpoint penerimaan pesan masuk WhatsApp bertanda tangan HMAC.

---

## 🚀 Menjalankan Secara Mandiri

```powershell
# 1. Instalasi dependensi
bun install

# 2. Cek typecheck
bun run typecheck

# 3. Mode pengembangan (auto-reload)
bun dev

# 4. Mode produksi
bun start
```
