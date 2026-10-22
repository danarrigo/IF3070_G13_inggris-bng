# Optimasi Pemuatan Kendaraan ke Kapal

Tugas Besar 1 IF3070 Dasar Inteligensi Artifisial 2026/2027, **Kelompok 13 - inggris-bng**.

## Tentang proyek

Proyek ini merupakan aplikasi untuk mencari susunan kendaraan pada geladak kapal menggunakan algoritma **local search**. Setiap kendaraan memiliki ukuran, berat, ETA, dan shipping fee. Tidak semua kendaraan harus dimuat: program mencari kombinasi kendaraan beserta penempatannya agar **total shipping fee kendaraan yang diangkut sebesar mungkin**.

Susunan kendaraan harus memenuhi tiga constraint:

1. Kendaraan tidak saling bertumpang tindih.
2. Seluruh bagian kendaraan yang dimuat berada di dalam geladak.
3. Total berat kendaraan yang dimuat tidak melebihi kapasitas kapal.

Aplikasi menyediakan editor konfigurasi, visualisasi kapal dan kendaraan dalam 2D/3D, grafik pencarian, penyimpanan hasil, serta berkas input/output untuk eksperimen. Hasil local search tidak selalu merupakan optimum global.

## Anggota dan pembagian tugas

| NIM | Pembagian tugas |
| --- | --- |
| 18224031 | Implementasi Hill Climbing |
| 18224093 | Implementasi Simulated Annealing |
| 18224107 | Implementasi Genetic Algorithm |

## Cara kerja

1. **Menentukan input.** Pengguna mengisi dimensi dan kapasitas kapal, daftar kendaraan, objective mode, serta parameter algoritma. Input juga dapat dimuat dari file JSON eksperimen.
2. **Membentuk initial state.** Backend mengacak urutan, orientasi, dan koordinat penempatan berdasarkan seed. Kendaraan yang tidak berhasil ditempatkan tetap berada di luar kapal.
3. **Menjalankan pencarian.** Algoritma mengevaluasi susunan yang valid dan memilih perubahan berdasarkan strategi masing-masing.
4. **Memvisualisasikan proses.** Frontend menampilkan penempatan kendaraan, perkembangan objective, dan metrik pencarian. HC dan SA mengirim perkembangan melalui WebSocket; GA menggunakan background job yang dipantau frontend.
5. **Menyimpan hasil.** Run yang selesai otomatis disimpan ke MongoDB. Jika opsi **Save results to output/** dicentang, backend juga membuat berkas JSON dan grafik SVG.
6. **Mengevaluasi hasil.** Pengguna dapat membandingkan initial/final arrangement, objective akhir, durasi, dan metrik khusus algoritma.

### Representasi state dan neighbor

State merupakan daftar kendaraan yang dimuat beserta ID, koordinat `(x, y)`, panjang, dan lebar setelah orientasi diterapkan. Kendaraan yang tidak tercantum dianggap berada di luar kapal. Koordinat menggunakan grid bilangan bulat dengan titik asal di kiri atas; sumbu X mengikuti lebar dan sumbu Y mengikuti panjang kapal.

Untuk HC, neighbor mencakup perpindahan ke koordinat lain, rotasi, pemindahan keluar kapal, pemasukan kendaraan, serta pertukaran dua kendaraan di dalam atau penggantian kendaraan di dalam dengan kendaraan di luar. Pertukaran dua kendaraan yang sama-sama di luar dilewati karena tidak mengubah state. Hanya perubahan yang memenuhi constraint yang dievaluasi.

### Algoritma yang tersedia

| Algoritma | Strategi pencarian |
| --- | --- |
| Steepest Ascent HC | Memeriksa seluruh neighbor valid dan memilih peningkatan objective terbesar. Berhenti jika tidak ada peningkatan atau batas iterasi tercapai. |
| Stochastic HC | Memilih secara acak neighbor yang meningkatkan objective, dengan peluang sebanding dengan besar peningkatannya. |
| Sideways HC | Mengutamakan peningkatan terbaik; jika tidak tersedia, dapat menerima state berbeda dengan skor sama sampai batas sideways berturut-turut. |
| Random Restart HC | Mengulang Steepest Ascent dari state awal acak dan mengembalikan solusi terbaik seluruh percobaan. |
| Simulated Annealing | Dapat menerima penurunan objective berdasarkan probabilitas dan suhu yang menurun selama pencarian. |
| Genetic Algorithm | Mengembangkan populasi susunan melalui seleksi, crossover, mutasi, dan elitisme. |

Pada Sideways, perbaikan skor mereset hitungan sideways berturut-turut. Pada Random Restart, `max_restart` menghitung restart di luar percobaan pertama dan `max_iterations` merupakan anggaran total seluruh percobaan. SA menggunakan `stuck_count` sebagai jumlah episode stagnasi tanpa best objective baru selama stagnation window, bukan pembuktian local optimum.

### Objective function

**Shipping fee (wajib, default):** jumlah shipping fee seluruh kendaraan yang dimuat. Semua eksperimen yang disertakan menggunakan mode ini.

**ETA priority (bonus):** menggunakan ETA saja, tanpa shipping fee:

```text
score = sum(maximum ETA seluruh config + 1 - ETA kendaraan yang dimuat)
```

ETA lebih kecil memberi poin lebih tinggi. Seluruh kontribusi positif dan kapal kosong mendapat skor 0. Mode ini memaksimalkan total poin prioritas, bukan meminimalkan rata-rata ETA. Pilih **Objective mode → ETA priority (bonus)** pada Configuration. Mode tersedia untuk HC, SA, dan GA; constraint penempatan tetap sama. Perbandingan same-config tidak mencampur objective mode yang berbeda.

## Teknologi dan kebutuhan

- **Backend:** Python 3.12+, uv, FastAPI.
- **Frontend:** Node.js 22.12+, npm, React, TypeScript, Vite, Three.js.
- **Database:** MongoDB; konfigurasi development tersedia melalui Docker Compose.

Docker hanya digunakan untuk MongoDB, bukan untuk menjalankan frontend/backend. MongoDB lokal atau layanan eksternal dapat digunakan dengan menyesuaikan `MONGODB_URI`. Penyelesaian run melalui web memerlukan database untuk menyimpan hasil. Editing dan preview config dapat digunakan tanpa database.

## Setup dan menjalankan aplikasi

Jalankan perintah berikut dari root repository. Gunakan terminal terpisah untuk backend dan frontend.

### 1. Jalankan MongoDB

```bash
docker compose up -d mongodb
```

Konfigurasi development menggunakan database di `localhost:27017`, username `devroot`, dan password `devrootpassword`. Kredensial ini hanya untuk development; jangan mengekspos MongoDB dengan kredensial default ke internet. Username, password, dan host port dapat diubah melalui `MONGO_ROOT_USERNAME`, `MONGO_ROOT_PASSWORD`, dan `MONGO_PORT` pada `.env` root. Sesuaikan juga URI backend jika nilainya diubah.

Data tersimpan pada volume `mongodb_data`. `docker compose down` menghentikan container tanpa menghapus volume; **`docker compose down -v` juga menghapus data database**.

### 2. Jalankan backend

```bash
cd src/backend
[ -f .env ] || cp .env.example .env
uv sync
uv run fastapi dev main.py
```

Backend: <http://127.0.0.1:8000>. Dokumentasi HTTP API: <http://127.0.0.1:8000/docs>.

Pengaturan koneksi pada `src/backend/.env`:

```dotenv
MONGODB_URI=mongodb://devroot:devrootpassword@localhost:27017/?authSource=admin
MONGODB_DATABASE=ship_optimizer
```

### 3. Jalankan frontend

Dari terminal lain di root repository:

```bash
cd src/frontend
npm ci
npm run dev
```

Buka URL yang ditampilkan Vite, biasanya <http://localhost:5173>. Vite meneruskan HTTP/WebSocket `/api` ke backend di `http://127.0.0.1:8000`.

## Menggunakan aplikasi

### Configuration

1. Atur ukuran dan kapasitas kapal.
2. Tambahkan kendaraan secara manual atau gunakan generator dengan rentang ukuran, berat, shipping fee, dan ETA.
3. Pilih objective mode. Gunakan **Shipping fee** untuk eksperimen wajib.
4. Biarkan **Use custom starting positions** nonaktif untuk inisialisasi acak. Jika aktif, pasangan X/Y yang sudah diisi dipertahankan dan kendaraan tanpa posisi tetap diacak.
5. **Save config** menyimpan konfigurasi utama; **Load saved** memuatnya kembali. Menjalankan algoritma tidak mewajibkan penyimpanan config terlebih dahulu dan tidak menimpa config utama.
6. Klik **Next: Optimization**.

### Optimization

1. Pilih HC, SA, atau GA. Untuk HC, pilih juga variannya.
2. Atur seed dan parameter pencarian.
3. Centang **Save results to output/** jika membutuhkan berkas hasil untuk laporan.
4. Klik tombol Run dan tunggu pencarian serta penyimpanan selesai.
5. Periksa state awal/akhir, grafik, objective, durasi, dan metrik pencarian. SA juga menyediakan **Run 3 experiments** dengan seed berurutan.

Pada HC, **Show every neighbor** nonaktif secara default. Jika diaktifkan, setiap neighbor valid ditampilkan berurutan tanpa melewati frame; neighborhood besar dapat membuat visualisasi lama. Kontrol **Slower/Faster** mengatur playback 0,25×-8× tanpa mengubah keputusan pencarian. **Compare iteration** menampilkan state sebelum/sesudah iterasi; replay ini hanya disimpan selama sesi halaman, bukan dalam JSON run HC.

Pada GA, **Rekam proses untuk demo** berbeda dari ekspor hasil. Demo dibatasi maksimum 10 individu, 10 generasi, dan 30 kendaraan. Matikan opsi demo untuk mengulang konfigurasi eksperimen GA yang disertakan.

### Results dan riwayat

Halaman **Results** menampilkan satu run HC beserta dua grid initial/final, grafik, metrik, dan ekspor JSON. **Compare with** menambahkan pembanding dengan config hash yang sama tanpa mengganti run utama. SA dan GA memiliki hasil/riwayat pada panel masing-masing di Optimization; SA juga menyediakan ekspor JSON seluruh batch.

Navigasi antarhalaman mempertahankan draft dan pengaturan selama sesi. Draft yang belum disimpan tidak bertahan setelah browser di-refresh.

## Mengulang eksperimen dari input

1. Klik **Import JSON**.
2. Pilih satu file dari `input/requests/`.
3. Config, algoritma/varian, seed, parameter, dan opsi output/demo akan terisi sesuai file.
4. Tinjau pengaturan lalu klik Run. Import tidak otomatis menjalankan pencarian atau menimpa config MongoDB.

Pilih `input/config.json` jika hanya ingin memuat konfigurasi tanpa mengganti parameter algoritma. Import dinonaktifkan selama run aktif; penggantian draft yang telah diedit memerlukan konfirmasi. Field tetap dapat diedit setelah import, sehingga perubahan manual dapat menghasilkan eksperimen berbeda.

Config, seed, parameter, serta versi kode/dependensi yang sama diharapkan menghasilkan keputusan pencarian yang sama. Durasi, timestamp, dan run ID dapat berbeda. Pengulangan seluruh 33 run untuk memverifikasi determinisme belum dilakukan.

## Input, output, dan eksperimen

```text
input/
  config.json          Konfigurasi bersama seluruh eksperimen
  requests/            33 request JSON, satu untuk setiap run
  initial_states/      State awal HC/SA untuk seed 42, 43, dan 44
  experiments.json     Pemetaan request, run ID, dan folder output
  README.md            Penjelasan parameter dan cara menjalankan ulang
output/
  experiments.csv      Rekap metrik seluruh 33 run
  <algorithm>/
    <run-id>/          Hasil lengkap satu run
```

Setiap folder run berisi:

| Berkas | Isi |
| --- | --- |
| `summary.json` | Parameter, seed, objective mode/unit, skor, durasi, iterasi/generasi, dan metrik khusus algoritma. |
| `run.json` | Config, initial/final arrangement, objective history, dan data tambahan yang direkam. |
| `initial.svg`, `final.svg` | Susunan kendaraan pada kapal dan daftar kendaraan di luar kapal. |
| `objective.svg` | Grafik objective terhadap iterasi; GA menampilkan maksimum dan rata-rata populasi terhadap generasi. |
| `exponential.svg` | Khusus SA: grafik eksponensial. Jika overflow, grafik diberi keterangan bahwa yang ditampilkan adalah logaritma naturalnya. |

Buka SVG menggunakan browser. Berkas dibuat oleh backend pada repository, bukan pada folder Downloads browser. MongoDB auto-save tetap aktif meskipun checkbox ekspor tidak dicentang. Satu bundle dipublikasikan setelah seluruh berkasnya berhasil ditulis; bila ekspor gagal setelah database berhasil disimpan, aplikasi melaporkan kegagalannya. Run parsial tidak dibuat menjadi bundle hasil.

JSON SA menyimpan nilai eksponensial yang finite dan `log_acceptance`; nilai eksponensial yang overflow direpresentasikan sebagai `null`.

### Eksperimen yang disertakan

Sebanyak **33 run** telah dijalankan dengan konfigurasi bersama: geladak **10 × 20**, kapasitas berat **10.000**, **10 kendaraan**, objective **Shipping fee**, dan custom starting positions nonaktif. Setiap varian/konfigurasi menggunakan seed **42, 43, 44**. Initial state semua varian HC dan SA telah diperiksa identik untuk seed yang sama; GA menggunakan populasi dan melaporkan individu terbaik populasi awal.

| Algoritma/kelompok | Parameter | Run |
| --- | --- | ---: |
| Steepest Ascent HC | Maksimum 100 iterasi | 3 |
| Stochastic HC | Maksimum 100 iterasi | 3 |
| Sideways HC | Maksimum 100 iterasi; batas sideways berturut-turut 10 | 3 |
| Random Restart HC | Total maksimum 100 iterasi; maksimum 3 restart | 3 |
| SA | Maksimum 1.000 iterasi; suhu awal 1.000; cooling rate 0,99; suhu minimum 0,001; stagnation window 100 | 3 |
| GA: populasi tetap | Populasi 30; iterasi 50, 100, 200; masing-masing 3 run | 9 |
| GA: iterasi tetap | Iterasi 100; populasi 10, 20, 40; masing-masing 3 run | 9 |
| **Total** | | **33** |

GA menggunakan crossover rate **0,8**, mutation rate **0,3**, dan demo recording nonaktif. Eksperimen bonus objective ETA tidak termasuk dalam 33 run ini.

## Struktur source code

```text
src/backend/
  algorithms/    Algoritma pencarian, initializer, objective, dan validasi
  api/           HTTP API dan WebSocket
  models/        Model config, run, dan job
  dtos/          Model request API
  services/      Eksekusi, penyimpanan, background job, dan ekspor hasil
  repository/    Akses MongoDB
  tests/         Pengujian backend
src/frontend/
  src/           Editor, panel algoritma, visualisasi, dan API client
  tests/         Pengujian frontend
input/           Data input eksperimen
output/          Hasil eksperimen
 docs/           Lokasi laporan PDF dan lampiran
```

## Pengujian

Jalankan pemeriksaan sesuai bagian yang diubah. Pemeriksaan lengkap:

```bash
(cd src/backend && uv run ruff format --check . && uv run ruff check . && uv run basedpyright && uv run pytest)
(cd src/frontend && npm run format:check && npm run lint && npm run typecheck && npm test && npm run build)
```

### API dan deployment

Request yang dapat dijalankan ulang tersedia dalam `input/requests/`. Endpoint utama: `POST /api/optimization/hill-climbing`, `POST /api/search/simulated-annealing`, dan `POST /api/jobs` untuk GA. Implementasi protokol live tersedia di [`api/optimization.py`](src/backend/api/optimization.py) dan [`api/search.py`](src/backend/api/search.py). HC memakai ACK per frame untuk pacing tanpa membuang neighbor; browser origin harus sesuai request host. Koneksi yang terputus membatalkan pekerjaan HC/SA yang masih berjalan, tetapi hasil yang sudah tersimpan tidak dihapus.

Untuk production, build frontend dengan `npm run build`, sajikan `src/frontend/dist` melalui static web server, dan teruskan `/api` ke backend termasuk WebSocket serta Host header asli. Jalankan backend dari `src/backend` dengan `uv run fastapi run main.py`. Proxy development Vite tidak berlaku pada build production.

## Catatan laporan dan pengumpulan

- Sideways memakai batas **berturut-turut** yang direset oleh peningkatan skor. Cocokkan interpretasinya dengan salindia/asisten karena spesifikasi tidak menjelaskan reset.
- Jelaskan definisi stagnasi SA saat menggunakan `stuck_count` sebagai indikator stuck.
- Laporan PDF ditempatkan di `docs/`, mencakup deskripsi persoalan, implementasi beserta source code, hasil dan analisis eksperimen, kesimpulan/saran, pembagian tugas, referensi, serta Form Penggunaan Generative AI yang diisi jujur.
- Data JSON dan grafik tidak menggantikan analisis laporan. Bandingkan kualitas solusi, durasi, konsistensi pengulangan, dan pengaruh parameter GA; jangan mengklaim optimum global tanpa dasar pembuktian.
- Commit/push source beserta input/output, pastikan repository public, dan buat release bertag **`vX.Y`** sesuai ketentuan tugas.
