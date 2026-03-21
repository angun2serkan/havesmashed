# havesmashed

Date tracking app with interactive globe visualization, friend system, badges, forum, and admin panel.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Rust (Axum), SQLx, PostgreSQL 16, Redis |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, react-globe.gl |
| Admin | React 19, TypeScript, Vite, Tailwind CSS |

---

## Quick Start with Docker

Hicbir sey kurmana gerek yok — sadece Docker.

### 1. Docker Kur

**macOS:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) indir ve kur.

**Ubuntu:**
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Terminali kapat-ac
```

### 2. Repoyu Cek

```bash
git clone <repo-url>
cd haveismashedV2
```

### 3. Ortam Dosyasini Olustur

```bash
cp .env.example .env
```

`.env` dosyasini ac ve degerleri degistir:

```env
POSTGRES_PASSWORD=guclu_bir_sifre
REDIS_PASSWORD=guclu_bir_redis_sifresi
JWT_SECRET=en_az_32_karakter_rastgele_bir_metin
JWT_EXPIRY=604800
ADMIN_API_KEY=admin_paneli_icin_guclu_anahtar
```

### 4. Baslat

```bash
docker compose up --build
```

> Ilk calistirmada Rust backend derleniyor, **5-10 dakika** surebilir. Sonrakiler cache sayesinde hizlidir.

### 5. Test Verilerini Yukle (Opsiyonel)

Seed data ile 5 hazir test kullanicisi ve ornek date'ler yuklenir:

```bash
docker compose cp backend/seed.sql postgres:/tmp/seed.sql
docker compose exec postgres psql -U havesmashed -d havesmashed -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
docker compose exec postgres psql -U havesmashed -d havesmashed -f /tmp/seed.sql
```

Test giris bilgileri icin `backend/seed_data.json` dosyasina bak. Ornek:
- **ahmet:** `abandon ability able about above absent absorb abstract absurd abuse access accident`

### 6. Kullan

| Servis | Adres |
|--------|-------|
| **Frontend** | http://localhost |
| **Admin Panel** | http://localhost:8080 |
| **API** | http://localhost:3000 |

### Docker Komutlari

```bash
docker compose up -d              # Arka planda baslat
docker compose down               # Durdur
docker compose down -v            # Durdur + veritabanini sil (sifirdan basla)
docker compose logs -f backend    # Backend loglarini izle
docker compose up --build backend # Sadece backend'i yeniden derle
```

---

## Quick Start without Docker (Manuel Kurulum)

### Gereksinimler

| Yazilim | Versiyon | Neden |
|---------|----------|-------|
| Rust | stable (latest) | Backend'i derlemek |
| Node.js | 18+ | Frontend, Admin |
| PostgreSQL | 16 | Veritabani |
| Redis | 7+ | Oturum cache |

### macOS Kurulumu

```bash
# Homebrew yoksa:
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Gerekli yazilimlari kur
brew install postgresql@16 redis node
brew services start postgresql@16
brew services start redis

# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
```

### Ubuntu / Debian Kurulumu

```bash
# PostgreSQL 16
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
sudo apt update && sudo apt install -y postgresql-16 redis-server

# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### Projeyi Calistir

#### 1. Veritabanini olustur

```bash
# macOS (Homebrew — sifresiz, kendi kullanici adinla):
createdb havesmashed

# Ubuntu:
sudo -u postgres psql -c "CREATE DATABASE havesmashed;"
```

#### 2. Backend'i yapilandir

```bash
cd backend
cp .env.example .env.dev
```

`.env.dev` dosyasini duzenle:

```env
# macOS: whoami komutunun ciktisini KULLANICI_ADIN yerine yaz
DATABASE_URL=postgres://KULLANICI_ADIN@localhost:5432/havesmashed

# Ubuntu: postgres kullanicisiyla
# DATABASE_URL=postgres://postgres:SIFREN@localhost:5432/havesmashed

REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=herhangi_rastgele_metin_en_az_32_karakter
JWT_EXPIRY=604800
ADMIN_API_KEY=herhangi_bir_admin_anahtari
HOST=0.0.0.0
PORT=3000
```

> **Kullanici adin ne?** Terminal'de `whoami` yaz.

#### 3. Backend'i baslat

```bash
cd backend
cargo run
```

Ilk calistirmada:
- Rust bagimliliklari indirilir ve derlenir (~2-5 dk, bir kere olur)
- 18 migration calisir (tablolar, indexler, constraint'ler olusur)
- 127 sehir, 103 tag, 19 badge otomatik eklenir (seed data)
- `pgcrypto` eklentisi otomatik yuklenir
- Sunucu `http://localhost:3000` adresinde baslar

**Basarili cikti:** `Starting server on 0.0.0.0:3000`

#### 4. Frontend'i baslat (yeni terminal)

```bash
cd frontend
npm install
npm run dev
```

Acilan adres: **http://localhost:5173**

#### 5. Admin paneli (yeni terminal, opsiyonel)

```bash
cd admin
npm install
npm run dev
```

Acilan adres: **http://localhost:5174**

Giris icin `.env.dev` dosyasindaki `ADMIN_API_KEY` degerini gir.

### Terminaller Ozeti

```
Terminal 1:  cd backend  && cargo run           → localhost:3000 (API)
Terminal 2:  cd frontend && npm run dev         → localhost:5173 (Web)
Terminal 3:  cd admin    && npm run dev         → localhost:5174 (Admin)
```

---

## Sik Karsilasilan Hatalar

| Hata Mesaji | Sebep | Cozum |
|-------------|-------|-------|
| `DATABASE_URL must be set` | `.env.dev` yok | `cp .env.example .env.dev` |
| `connection refused (5432)` | PostgreSQL kapali | `brew services start postgresql@16` |
| `database "havesmashed" does not exist` | DB olusturulmamis | `createdb havesmashed` |
| `connection refused (6379)` | Redis kapali | `brew services start redis` |
| `role "xxx" does not exist` | PG kullanicisi yok | `createuser -s $(whoami)` (macOS) |
| `address already in use :3000` | Port kullaniliyor | `lsof -i :3000` bul, `kill <PID>` |
| Docker build yavas | Rust ilk derleme | Normal, ~10 dk. Cache sonra hizli |
| `docker: permission denied` | Docker grubunda degilsin | `sudo usermod -aG docker $USER` + cikis/giris |

---

## Kullanim

### Ilk Kullanim

1. http://localhost:5173 ac (Docker'da http://localhost)
2. "Create Account" tikla — 12 kelimelik gizli cumle (seed phrase) verilir. **Kaydet!**
3. Bir kullanici adi (nickname) sec
4. Globe'da bir ulkeye tikla → sehir sec → date formunu doldur

### Arkadas Ekleme

1. Friends sayfasi → "Generate Friend Code"
2. 8 haneli kodu arkadasinla paylas
3. Arkadasin kendi Friends sayfasinda kodu girer → "Add Friend"

### Admin Paneli

1. http://localhost:5174 ac (Docker'da http://localhost:8080)
2. `ADMIN_API_KEY` degerini gir
3. Sehir, badge, bildirim yonet ve kullanici istatistiklerini gor

---

## Proje Yapisi

```
haveismashedV2/
├── backend/                  # Rust API (Axum framework)
│   ├── src/
│   │   ├── handlers/         # HTTP endpoint handler'lari
│   │   ├── services/         # Is mantigi (kripto, davet, kelime listesi)
│   │   ├── middleware/       # JWT kimlik dogrulama
│   │   ├── config.rs         # Ortam degiskeni yukleme
│   │   └── main.rs           # Giris noktasi
│   ├── migrations/           # 18 SQL migration (baslangicta otomatik calisir)
│   ├── Cargo.toml
│   └── .env.example
│
├── frontend/                 # React web uygulamasi
│   └── src/
│       ├── pages/            # Sayfa bilesenleri
│       ├── components/       # Globe, DateEntry, Friends, Forum, Badges...
│       ├── services/api.ts   # API istemcisi
│       ├── stores/           # Zustand state yonetimi
│       └── data/             # Tag ve ulke esleme verileri
│
├── admin/                    # React admin paneli
│   └── src/
│       ├── pages/            # Dashboard, Cities, Badges, Users...
│       └── services/         # Admin API istemcisi
│
├── docker-compose.yml        # Tek komutla tum servisleri baslat
├── .env.example              # Docker icin ortam degiskeni sablonu
└── README.md
```

---

## Veritabani

### Migration Sistemi

Backend her basladiginda `sqlx::migrate!()` otomatik calisir. Her migration dosyasi **sadece bir kez** calisir ve `_sqlx_migrations` tablosunda kaydedilir.

### Seed Data (Otomatik Eklenir)

| Veri | Miktar | Migration |
|------|--------|-----------|
| Sehirler | 127 (6 kitadan) | 002_seed_cities.sql |
| Etiketler | 103 (7 kategoride) | 003_seed_tags.sql + 004 |
| Rozetler | 19 (erkek/kadin/LGBT/genel) | 012_new_badges.sql |

### Veritabanini Sifirlamak

```bash
# Manuel kurulumda:
dropdb havesmashed && createdb havesmashed
cargo run    # migration'lar tekrar calisir

# Docker'da:
docker compose down -v    # volume'lari da siler
docker compose up --build
```

---

## API Genel Bakis

| Endpoint | Method | Auth | Aciklama |
|----------|--------|------|----------|
| `/api/auth/register` | POST | - | Hesap olustur (12 kelime al) |
| `/api/auth/login` | POST | - | Seed phrase ile giris |
| `/api/auth/nickname` | PUT | JWT | Nickname belirle |
| `/api/dates` | GET/POST | JWT | Date listele / olustur |
| `/api/dates/:id` | GET/PUT/DELETE | JWT | Date CRUD |
| `/api/cities` | GET | JWT | Sehirleri listele |
| `/api/tags` | GET/POST | JWT | Etiketleri listele / olustur |
| `/api/connections` | GET | JWT | Arkadaslari listele |
| `/api/connections/add` | POST | JWT | Arkadas ekle (kod ile) |
| `/api/invites/create` | POST | JWT | Davet / arkadas kodu olustur |
| `/api/stats` | GET | JWT | Istatistikler |
| `/api/badges/me` | GET | JWT | Rozetlerim |
| `/api/notifications` | GET | JWT | Bildirimler |
| `/api/friends/dates` | GET | JWT | Arkadas date'leri (sayfalamali) |
| `/api/forum/topics` | GET/POST | JWT | Forum konulari |
| `/api/privacy` | GET/PUT | JWT | Gizlilik ayarlari |
| `/api/admin/*` | Cesitli | Admin Key | Yonetim endpoint'leri |

---

