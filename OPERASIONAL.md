# SOP Ringkas Operasional STEAM YADIKA

Dokumen ini adalah draf kerja. Pengelola bengkel dan sekolah harus menyetujui serta menyesuaikannya sebelum diberlakukan.

## 1. Customer membuat pesanan

Customer masuk dengan akun terverifikasi, mengisi kontak, kendaraan, lokasi parkir, layanan, metode pembayaran (Cash/QRIS), dan waktu pembayaran (saat kunci dijemput/setelah layanan selesai). Customer menyetujui penggunaan data untuk pengelolaan layanan. Waktu persetujuan dicatat pada pesanan. Customer memeriksa kembali data sebelum mengirim.

## 2. Admin menerima dan menugaskan

Admin memeriksa detail pesanan, memeriksa item layanan dan harga. Untuk layanan yang memerlukan pemeriksaan/penawaran, admin menetapkan harga pada rincian pesanan. Admin memilih petugas aktif dan menugaskan pesanan. Sistem mengirim notifikasi kepada customer dan petugas.

## 3. Petugas menjemput kunci

Petugas membuka tugas yang ditugaskan kepadanya, memastikan identitas customer dan kendaraan, mencocokkan area parkir, lalu mengubah status menjadi **Kunci diterima** setelah kunci benar-benar diterima.

- Jika waktu pembayaran yang dipilih adalah **Saat kunci dijemput**, petugas menerima Cash atau memeriksa transaksi QRIS pada tahap ini. Setelah benar-benar diterima/berhasil, petugas mencatat pembayaran di aplikasi.
- Jika waktu pembayaran yang dipilih **Setelah layanan selesai**, pembayaran belum dicatat pada tahap penjemputan.

Kunci kendaraan harus dikelola sesuai prosedur fisik bengkel: label kode pesanan, tempat penyimpanan terkunci, dan serah-terima yang dapat ditelusuri.

## 4. Antrean dan pengerjaan

Setelah kunci diterima, petugas melanjutkan status ke **Dalam antrean**, kemudian **Sedang dikerjakan**. Petugas hanya boleh memperbarui pesanan yang ditugaskan kepadanya. Perubahan status tampil pada akun customer.

## 5. Motor selesai dan pengambilan

Setelah pekerjaan selesai, petugas mengubah status ke **Menunggu pengambilan**. Customer datang untuk mengambil motor. Jika customer memilih pembayaran **Setelah layanan selesai**, petugas menerima Cash atau memeriksa transaksi QRIS, lalu mencatatnya di aplikasi. Setelah pembayaran lunas dan motor diserahkan, petugas mengubah status menjadi **Selesai**.

## 6. Ketentuan pencatatan uang

- Jangan pernah menandai pembayaran lunas sebelum uang Cash diterima atau status transaksi QRIS dipastikan berhasil.
- Metode pembayaran yang dicatat harus sesuai metode pilihan customer. Aplikasi saat ini tidak menyediakan penggantian metode setelah pesanan dibuat. Jika customer meminta perubahan, hentikan proses pembayaran dan minta admin/pengelola menyelesaikan perubahan melalui prosedur tertulis sekolah sebelum pembayaran diterima; jangan mencatat metode yang berbeda dari pilihan pada pesanan.
- Nominal yang dicatat harus sama dengan total pesanan yang sudah ditetapkan.
- Jangan memakai akun orang lain untuk mencatat penerimaan uang.
- Selisih, salah transfer, pembayaran ganda, dan pembatalan setelah bayar harus dieskalasikan kepada admin/pengelola keuangan. Jika pengembalian penuh benar-benar sudah dilakukan, admin membuka detail pesanan lunas, memilih Catat pengembalian dana, memilih metode Cash/QRIS, mengisi alasan, lalu mengonfirmasi. Sistem menyimpan satu catatan refund penuh per pesanan dan mengurangi pendapatan bersih berdasarkan waktu dana dikembalikan. Refund sebagian belum didukung dan harus mengikuti SOP keuangan sekolah di luar aplikasi.

## 7. Penanganan akun dan data

Admin memverifikasi bahwa pendaftar merupakan warga sekolah, membuat akun petugas/pimpinan, menonaktifkan akun yang tidak lagi berwenang, dan mereset password melalui aplikasi. Data customer hanya digunakan untuk layanan, tidak diekspor atau dibagikan di luar kebutuhan operasional yang telah disetujui sekolah.

## 8. Penutupan operasional

Pada akhir hari, admin memeriksa pesanan yang masih terbuka, pesanan menunggu pengambilan, transaksi yang belum lunas, total Cash/QRIS berdasarkan waktu penerimaan uang, dan aktivitas yang tidak wajar. Laporan harian disimpan sesuai kebijakan retensi sekolah. Pastikan tidak ada kunci kendaraan tertinggal di area terbuka.


## 9. Pengembalian dana

Pengembalian dana dicatat hanya setelah uang benar-benar dikembalikan kepada customer. Fitur saat ini mendukung pengembalian penuh satu kali untuk setiap pesanan; metode, nominal, alasan, admin pemroses, dan waktu tersimpan sebagai riwayat. Untuk refund sebagian, minta keputusan pengelola keuangan dan lakukan pencatatan sesuai SOP di luar aplikasi agar pembukuan tidak keliru.
