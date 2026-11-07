# Status Pemeriksaan Paket STEAM YADIKA — 7 November 2026

Dokumen ini membedakan pemeriksaan statis yang sudah dijalankan dari pengujian integrasi yang masih harus dilakukan pada project Supabase dan perangkat sekolah.

## Pemeriksaan statis yang lulus

- JavaScript aplikasi lolos `node --check`.
- Kedua Edge Function lolos pemeriksaan sintaks TypeScript menggunakan parser TypeScript. Pemeriksaan tipe/runtime Deno belum dapat dilakukan di lingkungan penyusunan ini.
- Semua 25 variasi `data-action` yang ditemukan pada template aplikasi memiliki handler aksi.
- HTML memiliki 31 ID statis tanpa duplikasi.
- Referensi asset lokal pada HTML ditemukan.
- `manifest.webmanifest` valid sebagai JSON.
- `supabase/config.toml` valid sebagai TOML.
- Kurung kurawal CSS seimbang.
- Pembatas dollar-quote SQL seimbang.
- Sembilan tabel sensitif mengaktifkan Row Level Security (RLS).
- RPC operasional yang digunakan aplikasi memiliki pencabutan hak default dan grant eksplisit kepada role `authenticated`.
- `config.js` hanya berisi placeholder URL dan public/anon key; tidak berisi `service_role` atau secret.
- Asset shell yang dirujuk service worker tersedia di paket.

## Belum dapat diuji dari lingkungan penyusunan

- Menjalankan `database.sql` terhadap salinan database PostgreSQL/Supabase milik sekolah.
- Menjalankan Edge Function dalam runtime Deno dengan Supabase project nyata.
- Uji login, verifikasi akun, RLS, RPC, transaksi, refund, notifikasi, dan laporan memakai akun serta data uji di project Supabase.
- Uji browser interaktif lintas Android, iOS, desktop, jaringan lambat, dan pemakaian beberapa pengguna bersamaan.
- Uji backup dan restore database.
- Uji coba operasional penjemputan kunci, layanan bengkel, pembayaran cash/QRIS, serta penyerahan motor di lokasi.

## Syarat sebelum data warga sekolah sungguhan digunakan

1. Isi `config.js` dengan URL project dan public/anon key yang benar.
2. Tinjau kebijakan privasi, penanggung jawab data, masa retensi, SOP insiden, dan aturan akses bersama pihak sekolah.
3. Jalankan migrasi SQL pada salinan/staging database terlebih dahulu; verifikasi hasil migrasi dan transaksi historis sebelum produksi.
4. Deploy `register-member` dan `manage-account`, isi seluruh Supabase Secrets, dan hapus/nonaktifkan fungsi registrasi lama.
5. Buat minimal dua admin yang aktif dan terverifikasi; tetapkan petugas serta pimpinan.
6. Tetapkan katalog dan harga resmi layanan.
7. Jalankan seluruh skenario pada `tests/GO_LIVE_CHECKLIST.md` dan simpan bukti hasilnya.
8. Aktifkan backup dan buktikan pemulihan data pada project uji.
9. Lakukan pilot terbatas dan dapatkan persetujuan penanggung jawab operasional serta sekolah sebelum peluncuran luas.

**Kesimpulan:** paket kode telah melewati pemeriksaan statis yang tercantum di atas, tetapi belum dinyatakan siap produksi. Kesiapan operasional baru dapat diputuskan setelah seluruh pengujian integrasi dan uji lapangan lulus.
