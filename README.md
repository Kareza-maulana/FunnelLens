# FunnelLens — React Interactive Prototype

Prototipe demo berbahasa Indonesia berdasarkan mockup insight yang telah disetujui dan alur onboarding FunnelLens. Seluruh proses berjalan di browser. Tidak ada integrasi Meta, MCP, OAuth, AI, pembayaran iklan, atau analisis agentic sungguhan.

## Menjalankan

Node.js 20.19+ atau 22.12+ disarankan.

```sh
npm install
npm run dev
```

Buka URL yang ditampilkan Vite. Untuk build distribusi:

```sh
npm test
npm run build
npm run preview
```

Hasil build berada di `dist/`. Gunakan server HTTP; jangan membuka `index.html` melalui `file://`. HashRouter memungkinkan navigasi pada hosting statis tanpa konfigurasi rewrite.

## Alur demo

1. Isi profil bisnis atau klik **Isi contoh bisnis**. Produk, harga, varian, gambar, target pelanggan, dan wilayah disimpan otomatis.
2. Isi brand sendiri atau gunakan generator template lokal untuk memilih dan mengedit tiga konsep.
3. Pilih WhatsApp, landing page, atau gabungan. Uji form LP, atur audiens, budget periode, dan jadwal.
4. Review strategi cold-first, playbook funnel, dan teks creative.
5. Hubungkan akun **simulasi**, pilih aset, lalu review seluruh konfigurasi.
6. Centang persetujuan dan jalankan skenario berhasil atau gagal parsial. Retry memakai identitas pekerjaan yang sama. Campaign masuk ke Campaign Controls dengan status demo.
7. Jelajahi delapan area insight melalui sidebar. Audience WA dan LP menjadi dua tampilan pada satu area Audience Intelligence, sesuai revisi yang disetujui.

## Interaksi

- Overview merangkum Business Impact, Funnel, Audience, Campaign, Creative, AI Insight, dan Strategy sebelum saran aksi.
- Funnel: distribusi/tren, populasi profil/lead, drill-down tahap, dan metrik campaign.
- Audience: sumber WA/LP, nama dan nomor HP tersamarkan, level cold/warm/hot, pencarian, filter, ekspor, bukti, catatan, dan review klasifikasi manual.
- Campaign: tabel/matriks, sortir, compare, breakdown ad set, dan ekspor CSV.
- Creative: analisis per materi, storyboard, rekomendasi brief, draft variasi, dan saran alokasi.
- AI Insight: bukti, observasi, hipotesis, rekomendasi, status review, alasan, dan riwayat lokal.
- Strategy: slider budget, simulasi QL berbasis biaya konstan, review dan penerapan lokal.
- Business Impact: revenue, coverage atribusi, ROAS, tren, audit transaksi, dan penandaan review.
- Campaign Controls: tambah campaign demo, review status, pause/resume, dan budget simulasi.
- Integrations & Data: koneksi demo, ekspor/impor JSON, event log lokal, dan reset.
- Pencarian global dengan Ctrl/Cmd + K, notifikasi, panduan, drawer, dan modal keyboard accessible.

## Penyimpanan dan data

Data onboarding dan keputusan demo disimpan pada `localStorage` dengan kunci `funnellens:workspace:v1`. Penyimpanan terpisah untuk setiap origin, profil browser, dan perangkat. Data tidak dikirim ke server. Gunakan ekspor JSON untuk memindahkan draft antar-browser atau URL lokal/hosting. Mode privat dan penghapusan data browser dapat menghapus draft.

Foto dan logo opsional disimpan sebagai data URL, maksimal 750 KB per file untuk mengurangi risiko kuota browser. Jika penyimpanan penuh/diblokir, aplikasi menampilkan pesan dan menyediakan ekspor. Reset hanya menghapus kunci FunnelLens. Data rusak tidak ditimpa saat initial load; perubahan baru atau impor dapat memulai draft pengganti.

Metrik insight bersumber dari fixture di `src/lib/data.js`, bukan dari input onboarding. Profil bisnis dan aset dapat mengubah label/preview, tetapi tidak menciptakan klaim performa. Snapshot profil funnel, cohort lead, dan transaksi memakai unit berbeda dengan caption scope. September menjadi baseline; Juli/Agustus adalah skenario sintetis. Beberapa rekomendasi dan cohort sengaja memakai baseline September yang ditandai di UI.

Angka baseline: Rp24 juta spend, 720 qualified leads, 10.000 profil tertaut, 96 sampel lead lintas campaign, 240 transaksi dengan 180 tertaut dan 60 belum teratribusi. Tidak ada CAC karena status pelanggan baru tidak tersedia. Estimasi strategi adalah aritmetika linear, bukan prediksi AI.

## Stack dan struktur

React 19, Vite 6, React Router, Recharts, Lucide. `src/pages` berisi halaman, `src/context.jsx` mengelola workspace, `src/lib/domain.js` validasi/persistensi, dan `tests/domain.test.js` memeriksa batas utama. Gambar produk contoh berada di `public/product.png`. Font memakai DM Sans/Manrope bila tersedia dari Google Fonts, dengan fallback sistem.

Mockup PNG yang disetujui tetap berada di folder referensi semula dan tidak diubah oleh implementasi ini.
