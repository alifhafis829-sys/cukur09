# STEAM YADIKA — Sistem Operasional Final

Portal pemesanan dan operasional layanan kendaraan SMK YADIKA 13. Proyek ini tetap menggunakan nama dan basis proyek STEAM YADIKA yang sama; file ini menyempurnakan proyek utama, bukan membuat produk atau aplikasi kedua.

## 1. Cakupan final

### Pengguna dan hak akses

| Jenis akun | Kemampuan |
|---|---|
| Warga sekolah — siswa | Memesan layanan, memilih pembayaran, melihat pesanan dan notifikasi milik sendiri |
| Warga sekolah — guru | Kemampuan customer yang sama dengan siswa |
| Warga sekolah — karyawan | Kemampuan customer yang sama dengan siswa |
| Petugas bengkel | Melihat pesanan yang ditugaskan, mengambil kunci, memperbarui progres, mencatat pembayaran |
| Admin | Memverifikasi akun, menerima/menugaskan pesanan, mengatur harga, mengelola layanan dan akun, mencatat pembayaran, melihat laporan |
| Pimpinan | Dashboard dan laporan agregat tanpa akses ke data pribadi customer |

Identitas (`member_type`: student/teacher/employee) dipisahkan dari hak akses operasional (`role`: member/staff/admin/leadership). Akun pendaftaran warga sekolah dibuat sebagai `member` dan berstatus menunggu verifikasi admin. Akun petugas, admin, dan pimpinan hanya dibuat oleh admin.

### Alur pesanan

`Menunggu konfirmasi` → `Menunggu penjemputan` → `Kunci diterima` → `Dalam antrean` → `Sedang dikerjakan` → `Menunggu pengambilan` → `Selesai`.

Pembatalan hanya tersedia dalam kondisi yang dibatasi oleh database. Customer dapat membatalkan pesanan sebelum diterima admin. Admin dapat membatalkan pesanan yang belum lunas dan belum selesai.

### Pembayaran

Metode dan waktu pembayaran merupakan dua pilihan terpisah:

- Metode: `Cash` atau `QRIS`.
- Waktu: `Saat kunci dijemput` atau `Setelah layanan selesai`.

Keempat kombinasi didukung. Pembayaran tidak diproses melalui payment gateway di aplikasi. Customer membayar langsung kepada petugas; petugas yang ditugaskan atau admin mencatat penerimaan pembayaran di aplikasi setelah uang diterima atau QRIS berhasil diverifikasi.

Database menegakkan tahap pembayaran:

- `Saat kunci dijemput`: pembayaran dicatat ketika status `Kunci diterima`, sebelum motor masuk antrean.
- `Setelah layanan selesai`: pembayaran dicatat ketika status `Menunggu pengambilan`, sebelum pesanan ditandai `Selesai`.

Nominal yang dicatat harus sama dengan total pesanan. Harga layanan yang masih Rp0 harus ditetapkan admin untuk setiap item sebelum pembayaran dapat dicatat. Riwayat transaksi menyimpan metode, nominal, waktu, petugas penerima, dan catatan. Pada pesanan lunas dari skema lama yang tidak memiliki data penerima, transaksi historis tetap dimigrasikan agar laporan tidak kehilangan pendapatan; penerimanya ditampilkan sebagai tidak tercatat pada skema lama, bukan direka.

## 2. Struktur teknis

- Frontend: HTML, CSS, JavaScript vanilla.
- Authentication, database, RLS, RPC: Supabase Auth dan PostgreSQL.
- Fungsi server: Supabase Edge Functions (Deno).
- Hosting frontend: GitHub Pages atau hosting HTTPS lain.
- PWA: service worker hanya menyimpan shell statis; login, transaksi, dan sinkronisasi tetap membutuhkan internet.

## 3. Persiapan Supabase

1. Buat atau gunakan project Supabase milik sekolah.
2. Buka **SQL Editor** dan jalankan seluruh isi `database.sql` satu kali. Script ini dirancang untuk memperbarui struktur proyek awal, termasuk mengubah role lama `student` menjadi `member` dan menyimpan identitas lama sebagai `member_type = student`.
3. Periksa tabel `profiles`, `services`, `orders`, `order_items`, `payments`, `refunds`, `notifications`, dan `audit_logs` telah tersedia.
4. Isi `config.js` dengan Project URL dan publishable/anon key dari Supabase. Key ini memang dipakai di browser; jangan pernah menaruh `service_role` atau secret key di `config.js`, HTML, atau repository publik.
5. Pasang Supabase CLI, lalu jalankan:

   ```bash
   supabase login
   supabase link --project-ref PROJECT_REF
   supabase secrets set SUPABASE_URL=https://PROJECT_REF.supabase.co SUPABASE_ANON_KEY=ANON_OR_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY=SERVICE_ROLE_KEY APP_ORIGIN=https://USERNAME.github.io
   supabase functions deploy register-member
   supabase functions deploy manage-account
   ```

   `APP_ORIGIN` wajib diisi dan harus berupa **origin** website, tanpa path repository. Contoh: `https://username.github.io`, bukan `https://username.github.io/nama-repo/`. Fungsi menolak origin browser yang tidak cocok. Simpan service-role key hanya di Secrets Supabase. Setelah dua fungsi baru berhasil dideploy, **hapus/nonaktifkan Edge Function lama `register-student` dari project Supabase** agar endpoint registrasi lama tidak tertinggal.

6. File `supabase/config.toml` menjaga `verify_jwt = true` untuk fungsi pengelolaan akun. Fungsi `register-member` sengaja menerima pendaftaran publik, sehingga `verify_jwt = false`; fungsi itu melakukan validasi input, pembatasan percobaan per IP secara best-effort, membuat akun belum terverifikasi, dan tidak memberi akses pemesanan sebelum admin menyetujui akun.
7. Buat admin pertama melalui **Authentication → Users → Add user**. Gunakan email internal dengan pola `adminutama@login.steam-yadika.invalid`, set email confirmed, lalu salin UUID user dan jalankan (ganti UUID):

   ```sql
   insert into public.profiles
     (id, username, full_name, class_name, member_type, role, is_active, is_verified)
   values
     ('UUID-USER', 'adminutama', 'Admin Utama', 'Manajemen', 'employee', 'admin', true, true);
   ```

8. Login sebagai admin. Verifikasi akun warga sekolah yang mendaftar, lalu buat akun petugas dan pimpinan melalui **Manajemen akun**.
9. Atur nama, deskripsi, dan harga layanan sesuai keputusan resmi sekolah. Jangan gunakan harga contoh sebagai harga final tanpa persetujuan pengelola.
10. Upload isi repository ke GitHub Pages pada branch dan folder yang benar. Pastikan website aktif dengan HTTPS.

## 4. File penting

| File | Fungsi |
|---|---|
| `index.html` | Kerangka aplikasi dan formulir autentikasi |
| `app.js` | Login, registrasi, pemesanan, customer, petugas, admin, laporan, notifikasi |
| `style.css` | Desain responsif desktop dan mobile |
| `config.js` | Project URL dan public key Supabase |
| `database.sql` | Schema, migrasi awal, RPC transaksi/pengembalian, RLS, audit, dan laporan |
| `supabase/functions/register-member/index.ts` | Registrasi siswa/guru/karyawan dengan verifikasi admin |
| `supabase/functions/manage-account/index.ts` | Pembuatan akun operasional, daftar akun, verifikasi, aktivasi, reset password |
| `supabase/config.toml` | Pengaturan validasi JWT Edge Functions |
| `sw.js` | Cache shell statis; tidak pernah cache response transaksi |
| `tests/GO_LIVE_CHECKLIST.md` | Skenario uji sebelum peluncuran |
| `docs/STATUS_PENGUJIAN.md` | Catatan pemeriksaan statis dan batas pengujian integrasi |

## 5. Keamanan dan batasan yang wajib dipahami

- RLS membatasi pesanan customer pada pesanan miliknya, petugas pada pesanan yang ditugaskan, dan admin pada seluruh pesanan operasional.
- Pimpinan hanya memperoleh ringkasan agregat melalui RPC laporan; tidak diberi akses baca langsung ke data pribadi pesanan.
- Perubahan status dan pembayaran dilakukan melalui RPC yang memeriksa role, penugasan petugas, nominal, metode, dan tahap alur.
- Edge Function pengelolaan akun memverifikasi JWT pengguna lalu memeriksa role admin di database sebelum melakukan tindakan dengan service-role key.
- Persetujuan penggunaan data wajib dicentang saat pemesanan, divalidasi ulang di RPC PostgreSQL, dan waktu persetujuannya disimpan pada pesanan. Field lokasi “Area lainnya” wajib diisi dengan detail patokan; nomor WhatsApp divalidasi di browser dan database. Ini adalah dasar teknis; sekolah tetap harus menyetujui pemberitahuan privasi, tujuan pemrosesan, retensi, dan penanggung jawab datanya sebelum go-live.
- Registrasi publik memerlukan verifikasi admin. Fungsi registrasi menolak Origin selain `APP_ORIGIN`; pembatasan per-IP adalah lapisan awal, bukan pengganti CAPTCHA/WAF bila pendaftaran diserang. Origin browser harus sama persis dengan secret `APP_ORIGIN`.
- Aplikasi membutuhkan koneksi internet. Jangan menganggap tampilan yang tersimpan di cache sebagai bukti transaksi tersimpan. Daftar pesanan dan akun admin dimuat per halaman (100 data) agar daftar tetap dapat ditelusuri ketika jumlah pengguna dan transaksi bertambah.
- Ekspor laporan tersedia dalam CSV. Laporan yang diekspor merupakan data agregat dan tidak memuat nomor WhatsApp atau nomor polisi. Pendapatan bersih menghitung uang masuk dikurangi pengembalian dana pada periode transaksi masing-masing (Asia/Jakarta).
- Pengembalian dana didukung sebagai pengembalian penuh oleh admin setelah dana benar-benar dikembalikan di luar aplikasi. Metode, nominal, alasan, admin pemroses, dan waktu disimpan pada tabel `refunds`; hanya satu pengembalian yang dapat dicatat untuk setiap pesanan. Pengembalian untuk pesanan yang belum selesai sekaligus menutup pesanan sebagai dibatalkan. Pengembalian sebagian belum didukung dan harus ditangani melalui SOP keuangan sekolah di luar alur aplikasi.
- Sistem belum boleh menerima data pribadi sungguhan sampai sekolah selesai meninjau kebijakan privasi, penanggung jawab data, akses admin, prosedur insiden, backup, dan pengujian.

## 6. Backup, operasional, dan peluncuran

Sebelum digunakan harian, pengelola project Supabase harus mengaktifkan backup yang sesuai dengan paket/konfigurasi project dan melakukan simulasi restore. Tentukan siapa yang berwenang membuat akun admin, memverifikasi anggota, menetapkan harga, menerima pembayaran, menangani pembatalan, serta mengakses laporan.

Lakukan uji penerimaan menggunakan akun terpisah untuk: siswa, guru, karyawan, petugas A, petugas B, admin, dan pimpinan. Pastikan petugas A tidak bisa membuka atau mengubah pesanan petugas B; pimpinan tidak bisa membaca detail customer; akun yang belum diverifikasi tidak bisa membuat pesanan; dan customer tidak bisa menandai pembayarannya sendiri sebagai lunas.

Jalankan semua skenario dalam `tests/GO_LIVE_CHECKLIST.md`. Peluncuran baru boleh dilakukan setelah seluruh skenario kritis lolos, database backup/restore teruji, konfigurasi produksi sudah diisi, dan penanggung jawab sekolah memberikan persetujuan.

## 7. Catatan transparansi

Paket ini adalah implementasi kode dan rancangan operasional yang disiapkan dari ZIP proyek yang diberikan. Paket ini belum terhubung ke project Supabase sekolah, belum memakai kredensial produksi, dan belum menjalani uji integrasi dengan database nyata, akun sekolah, perangkat petugas, atau alur pembayaran di lokasi. Karena itu tidak tepat untuk menyebutnya sudah 100% siap produksi sebelum checklist dan uji lapangan lulus.
