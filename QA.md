# Pemeriksaan prototipe — 17 Oktober 2026

## Otomatis

`npm test`: 9 lulus. Mencakup round-trip localStorage, isolasi reset, data rusak/kuota, validasi impor, destinasi WA/LP/gabungan, jadwal/budget/usia, persetujuan dan aset, rekonsiliasi fixture, generator brand, dan CSV escaping.

`npm run build`: build produksi Vite berhasil. Bundle dipisahkan menjadi aplikasi, React/router, dan grafik.

## Browser

Pengujian melalui browser lokal pada server Vite:

- Onboarding contoh bisnis → tiga konsep brand → pilih brand → campaign gabungan WA/LP → preview LP dan kirim contoh form → strategi/creative → akun Meta simulasi → review.
- Tombol kirim disabled sebelum consent. Skenario gagal parsial berhenti; retry berhasil dengan satu receipt tersimpan. Campaign masuk Campaign Controls sebagai pending review demo.
- Reload setelah onboarding mempertahankan profil dan hasil onboarding. Metrik insight tetap fixture terpisah.
- Funnel: klik TOFU membuka konteks; tab tren berfungsi.
- Audience: review level dengan alasan tersimpan; perpindahan LP/WA dan pemilihan campaign WA-only mengembalikan sumber WA.
- Campaign: pilih Prospecting + Retargeting, buka modal perbandingan dan metrik terkait.
- Creative: modal draft bisa disimpan secara lokal.
- AI Insight: ubah status dengan catatan review.
- Strategy: review dan setujui alokasi. Campaign Controls menampilkan budget skenario baru; spend historis tetap.
- Business: tampilkan tren, filter transaksi unknown, inspect, tandai untuk review.
- Campaign Controls: pause demo melalui modal review; receipt onboarding tampil satu kali.
- Integrations & Data: tambahkan event lokal dan ekspor JSON berhasil.
- Semua halaman insight dan utilitas dapat dibuka melalui navigasi mobile pada viewport 390×844, tanpa overflow horizontal dokumen. Tabel lebar memiliki scroll di panelnya sendiri.
- Enam langkah onboarding juga diperiksa pada viewport 390×844, tanpa overflow horizontal dokumen.
- Layout desktop diperiksa pada 1440×1000.
- Tidak ada error JavaScript pada log browser selama alur yang diuji.

## Batas verifikasi

Tidak ada integrasi eksternal yang diuji karena seluruh koneksi dan generator adalah simulasi. Uji unit mencakup reset dan validasi impor; uji browser mencakup ekspor, tetapi tidak melakukan reset atau impor yang mengganti seluruh draft. Browser yang digunakan bukan perangkat fisik ponsel. Pemeriksaan ini bukan audit aksesibilitas atau sertifikasi browser menyeluruh.
