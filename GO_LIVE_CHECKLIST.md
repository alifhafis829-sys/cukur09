# STEAM YADIKA — Checklist Uji Terima Sebelum Go-Live

**Aturan:** gunakan akun uji dan data kendaraan fiktif. Jangan gunakan nomor WhatsApp atau data pribadi warga sekolah saat uji pertama. Catat hasil, bukti, penguji, tanggal, dan nomor build.

## A. Akun dan identitas
- [ ] Siswa dapat mendaftar dan memilih jenis akun Siswa.
- [ ] Guru dapat mendaftar dan mengisi unit kerja.
- [ ] Karyawan dapat mendaftar dan mengisi unit kerja.
- [ ] Semua pendaftar berstatus menunggu verifikasi dan tidak dapat membuat pesanan sebelum disetujui admin.
- [ ] Admin dapat memverifikasi akun, lalu pengguna dapat masuk dan memesan.
- [ ] Pendaftar dengan username duplikat ditolak dengan pesan yang jelas.
- [ ] Endpoint registrasi menolak Origin selain APP_ORIGIN dan tabel percobaan lama dibersihkan sesuai retensi.
- [ ] Password kurang dari 10 karakter ditolak saat registrasi.
- [ ] Akun nonaktif tidak dapat memakai aplikasi.
- [ ] Akun petugas/admin/pimpinan hanya dapat dibuat melalui admin.
- [ ] Admin terakhir tidak dapat menonaktifkan akunnya sendiri atau membuat sistem tanpa admin aktif.
- [ ] Reset password admin berfungsi, menandai sesi/token lama tidak valid, dan pengguna harus login ulang memakai password sementara.
- [ ] Pengguna yang wajib ganti password tidak dapat membaca pesanan atau memanggil RPC operasional secara langsung sebelum mengubah password.
- [ ] Flag wajib ganti password hanya terhapus setelah hash password Auth benar-benar berubah; pemanggilan RPC langsung tidak dapat melewatinya.

## B. Hak akses dan privasi
- [ ] Customer hanya melihat profil, notifikasi, dan pesanan miliknya.
- [ ] Customer A tidak dapat membaca detail pesanan Customer B dengan mengganti ID di request/RPC.
- [ ] Petugas A hanya melihat pesanan yang ditugaskan kepadanya.
- [ ] Petugas A tidak dapat mengubah status atau mencatat pembayaran untuk pesanan Petugas B.
- [ ] Petugas tidak dapat membuat/mengubah akun, mengubah katalog, atau melihat laporan admin.
- [ ] Admin dapat mengelola akun, layanan, antrean, harga pesanan, dan pembayaran.
- [ ] Pimpinan dapat membuka ringkasan laporan tetapi tidak dapat membaca data WhatsApp, nomor polisi, alamat parkir, maupun detail pesanan melalui Data API.
- [ ] Tidak ada `service_role`/secret key dalam file frontend, GitHub, source map, atau browser network payload.
- [ ] Semua tabel sensitif memiliki RLS aktif dan privilege sesuai kebutuhan.

## C. Pemesanan
- [ ] Siswa, guru, dan karyawan yang terverifikasi dapat membuat pesanan.
- [ ] Field wajib dan format nomor WhatsApp divalidasi.
- [ ] Customer wajib memilih minimal satu layanan.
- [ ] Persetujuan penggunaan data wajib dicentang; RPC database menolak pesanan tanpa persetujuan.
- [ ] Waktu persetujuan penggunaan data tersimpan pada pesanan.
- [ ] Layanan nonaktif tidak tampil pada formulir pemesanan.
- [ ] Harga pada item pesanan menjadi snapshot dan tidak berubah ketika harga katalog diedit.
- [ ] Customer melihat kode pesanan dan status setelah submit.
- [ ] Refresh halaman tidak menghilangkan pesanan yang sudah tersimpan.
- [ ] Customer hanya dapat membatalkan sebelum pesanan diterima admin.
- [ ] Admin dapat menetapkan harga item yang perlu konfirmasi sebelum pembayaran.

## D. Empat kombinasi pembayaran
Lakukan setiap skenario dengan pesanan yang berbeda:
- [ ] Cash + Saat kunci dijemput: pembayaran hanya dapat dicatat pada status Kunci diterima.
- [ ] QRIS + Saat kunci dijemput: petugas melihat pilihan QRIS, memeriksa transaksi, lalu mencatat pembayaran pada status Kunci diterima.
- [ ] Cash + Setelah layanan selesai: pembayaran hanya dapat dicatat pada status Menunggu pengambilan.
- [ ] QRIS + Setelah layanan selesai: petugas memeriksa transaksi QRIS lalu mencatat pada status Menunggu pengambilan.
- [ ] Pilihan metode tidak dapat diganti oleh petugas saat mencatat pembayaran.
- [ ] Nominal kurang/lebih dari total ditolak.
- [ ] Pembayaran dengan harga layanan yang belum ditetapkan ditolak.
- [ ] Pembayaran yang sama tidak dapat dicatat dua kali.
- [ ] Admin hanya dapat mencatat pengembalian penuh setelah dana benar-benar dikembalikan; metode, alasan, nominal, waktu, dan admin tercatat.
- [ ] Pengembalian untuk pesanan yang belum selesai menutup pesanan sebagai dibatalkan.
- [ ] Pengembalian dana tidak dapat dicatat dua kali untuk satu pesanan.
- [ ] Laporan mengurangi refund dari pendapatan bersih berdasarkan waktu dana dikembalikan.
- [ ] Status pesanan tidak dapat menjadi Selesai sebelum pembayaran lunas.
- [ ] Pembayaran yang sudah tercatat muncul pada riwayat dengan nominal, metode, waktu, dan penerima.
- [ ] Transaksi historis lunas dari skema lama tetap masuk laporan walaupun petugas penerima tidak tersedia; UI menandainya sebagai data lama yang tidak tercatat, bukan mengarang penerima.

## E. Penjemputan, pengerjaan, dan pengambilan
- [ ] Admin menugaskan pesanan kepada petugas aktif.
- [ ] Petugas menerima notifikasi penugasan.
- [ ] Petugas melihat kelas/unit, kontak, motor, plat, area parkir, dan catatan customer pada detail tugas.
- [ ] Petugas mengubah status Menunggu penjemputan → Kunci diterima.
- [ ] Alur dilanjutkan ke Dalam antrean → Sedang dikerjakan → Menunggu pengambilan.
- [ ] Untuk pembayaran saat penjemputan, sistem menahan perpindahan ke Dalam antrean jika belum lunas.
- [ ] Untuk pembayaran setelah layanan selesai, sistem menahan status Selesai sampai lunas.
- [ ] Status yang melompati tahapan atau tidak sah ditolak database.
- [ ] Customer mendapat notifikasi perubahan status dan pembayaran.

## F. Admin, laporan, dan data operasional
- [ ] Admin dapat menambah, mengedit, menonaktifkan, dan mengaktifkan kembali layanan.
- [ ] Admin dapat mencari pesanan berdasarkan kode, nama, dan nomor plat serta memfilter status.
- [ ] Daftar pesanan dan daftar akun admin dapat memuat halaman berikutnya tanpa menggandakan data.
- [ ] Daftar pesanan memuat 100 data per halaman dengan keyset pagination; saat ada pesanan baru masuk di bagian atas, pemuatan halaman berikutnya tidak menggandakan atau melewatkan pesanan lama.
- [ ] Admin dapat membuat petugas dan admin baru.
- [ ] Admin dapat mengaktifkan/menonaktifkan akun dengan perlindungan admin aktif terakhir.
- [ ] Laporan menghitung volume pesanan berdasarkan tanggal dibuat dan penerimaan Cash/QRIS berdasarkan waktu uang diterima (Asia/Jakarta), termasuk pembayaran dari pesanan yang dibuat pada hari sebelumnya.
- [ ] Laporan CSV dapat dibuka dengan Excel/Google Sheets dan tidak memuat data pribadi customer.
- [ ] Pesanan yang dibuat pada hari sebelumnya tetapi dibayar hari ini masuk volume pesanan pada tanggal pembuatan dan pendapatan pada tanggal penerimaan.
- [ ] Dashboard pimpinan hanya menampilkan statistik agregat.
- [ ] Audit log memuat pembuatan order, penugasan, perubahan status, penetapan harga, pembayaran, pembatalan, dan perubahan akun.

## G. Perangkat, performa, dan pemulihan
- [ ] Semua halaman diuji di Android dengan lebar layar kecil.
- [ ] Semua halaman diuji di desktop/laptop.
- [ ] Formulir, modal, list, dan navigasi dapat digunakan tanpa horizontal overflow yang tidak perlu.
- [ ] Koneksi terputus saat submit tidak menghasilkan status palsu bahwa pesanan berhasil.
- [ ] Setelah koneksi pulih, pengguna dapat memuat ulang dan melihat status dari database.
- [ ] Beberapa customer dapat memesan bersamaan tanpa kode pesanan duplikat.
- [ ] Dua petugas/admin tidak dapat mencatat pembayaran ganda untuk order yang sama.
- [ ] Backup terjadwal aktif dan simulasi restore ke lingkungan uji berhasil.
- [ ] SOP insiden, eskalasi, reset password, dan penanganan salah catat pembayaran tersedia.

## H. Persetujuan peluncuran
- [ ] Semua temuan kritis ditutup.
- [ ] Penanggung jawab bengkel menyetujui SOP status, penjemputan kunci, pembayaran, dan pengambilan motor.
- [ ] Penanggung jawab sekolah menyetujui kebijakan data pribadi, pembatasan akses, dan retensi data.
- [ ] Admin utama dan admin cadangan telah ditunjuk.
- [ ] Backup/restore, monitoring, domain HTTPS, dan konfigurasi Supabase produksi diverifikasi.
- [ ] Uji coba terbatas selesai dan disetujui sebelum pembukaan ke seluruh warga sekolah.

**Hasil:** ☐ Lulus ☐ Belum lulus  
**Penguji:** ____________________  
**Tanggal:** ____________________  
**Build/commit:** ____________________  
**Catatan temuan:** ______________________________________________________
