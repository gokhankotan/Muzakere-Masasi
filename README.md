# ⚖️ Müzakere Masası — Kamusal Alan & Uzlaşı Platformu

> **Habermas'ın İdeal Konuşma Durumu teorisine dayalı, gerçek zamanlı fikir kümeleme, çoklu dil desteği, gelişmiş moderasyon, azınlık görüşü koruması, şeffaflık paneli ve dinamik uzlaşı tespit platformu.**

Müzakere Masası, sosyal medyanın kutuplaştırıcı yapısına karşı geliştirilen bir dijital müzakere ve kamusal alan aracıdır. Katılımcıların görüşlerini toplar, matematiksel algoritmalarla (PCA + K-Means) fikir gruplarını haritalandırır, tüm tarafların ortaklaşa desteklediği **Köprü Cümleleri** otomatik olarak tespit eder, azınlıkta kalan nitelikli argümanları öne çıkarır ve kutuplaşma trendini zaman içinde zaman serisi grafikleriyle görselleştirir.

---

## 📑 İçindekiler

- [Kuramsal Temel](#-kuramsal-temel)
- [Öne Çıkan Özellikler](#-öne-çıkan-özellikler)
- [CompDemocracy OpenData Oturumları](#-compdemocracy-opendata-oturumları)
- [Teknoloji Yığını](#-teknoloji-yığını)
- [Proje Mimarisi](#-proje-mimarisi)
- [Kurulum & Çalıştırma](#-kurulum--çalıştırma)
- [Ortam Değişkenleri (`.env`)](#-ortam-değişkenleri-env)
- [Kullanım Kılavuzu](#-kullanım-kılavuzu)
- [API ve Soket Referansı](#-api-ve-soket-referansı)
- [Algoritmalar & Güvenlik Mimarisi](#-algoritmalar--güvenlik-mimarisi)
- [Test & Doğrulama (116/116 PASSING)](#-test--doğrulama-116116-passing)
- [Lisans](#-lisans)

---

## 📚 Kuramsal Temel

Platform, Alman filozofu **Jürgen Habermas**'ın iki temel kavramına dayanır:

### Kamusal Alan (Öffentlichkeit)
Bireylerin eşit koşullarda, özgürce tartışarak toplumsal meseleleri müzakere ettiği demokratik alan. Müzakere Masası bu alanı dijital ortama taşır.

### İdeal Konuşma Durumu (Ideale Sprechsituation)
Habermas'ın öne sürdüğü, gerçek bir uzlaşının sağlanabilmesi için gerekli normatif koşullar:

| İlke | Platformdaki Karşılığı |
|------|----------------------|
| **Eşit Katılım** | Her katılımcının eşit oy hakkı, anonim oylama sistemi |
| **Gerekçelendirme** | Fikir havuzında rasyonel gerekçelendirme ve çok dilli kalite skorlaması (`quality.service.js`) |
| **Samimiyet** | Anonim ve baskısız oy kullanma ortamı |
| **Evrensel Erişim** | Herkese açık (PUBLIC) veya şifre korumalı katılım |
| **Azınlık Koruması** | Çoğunluk baskısı altında kaybolan nitelikli fikirlerin korunması (Minority Opinion Shield) |

---

## ✨ Öne Çıkan Özellikler

1. 🏛️ **Swiss Bento Grid & Çift UI Tasarım Altyapısı:** Swiss International tipografi disiplini (Inter/Outfit), rasyonel asimetrik grid düzeni ve `✨ UI: Swiss Bento` / `🏛️ UI: Klasik` anlık geçiş butonu (`muzakere_ui_mode`).
2. ⚡ **Neo-Brutalist Köprü Görüş Vurgusu:** Uzlaşı cümleleri için 2.5px solid border, `#2563EB` mavi sol şerit ve `⚡ KÖPRÜ GÖRÜŞ (ORTAK MUTABAKAT)` rozetli özel kart tasarımı (`.bridge-accent-card`).
3. 🛡️ **Azınlık Görüşü Koruması (Minority Opinion Shield):** Türkçe ve İngilizce gerekçe kalitesi skorlaması (`calculateReasoningQualityScore`), minimum oy süzgeci (`MINORITY_MIN_VOTES = 3`) ile hiç oy almamış görüşleri eleyip çoğunluk baskısı altında kalan güçlü argümanları öne çıkarma.
4. 🔍 **Şeffaflık Paneli ("Neden Bu Gruptayım?"):** Katılımcının oy örüntüsünü grubun kabul oranlarıyla ($O(1)$ önbellek / $O(n \times S)$ lazy fallback) karşılaştırarak kampa atanma nedenini açıklayan matematiksel şeffaflık katmanı.
5. 🔒 **Sıkı BOLA Güvenlik Koruması:** Kamp atama açıklamasında `decoded.participantId === participantId` JWT sahiplik zorunluluğu (Yetkisiz katılımcıların başkalarının verisine erişmesi %100 engellenmiştir).
6. 📈 **Kutuplaşma Trendi Zaman Serisi (Polarization History):** Olay bazlı zaman serisi kaydı (100 elemanlı circular buffer), `isSimulated` bayrağı ile simülasyon ayrımı ve Admin Dashboard Recharts alan grafiği.
7. 💎 **LLM API Kullanım Optimizasyonu & Batching:** SHA-256 hash + sürüm bazlı sonuç önbellekleme (`getFromLlmCache`), toplu (batch) küme özetleme (`generateAllClusterSummaries`), `inFlightConsensusLocks` ile spam koruması.
8. 📊 **Anlamlı Değişim Eşiği (Mutation Threshold System):** `MUTATION_THRESHOLD_VOTES` (5) ve `MUTATION_THRESHOLD_OPINIONS` (2) sayaçları ile gereksiz LLM çağrılarının engellenmesi, yapısal değişikliklerde bypass.
9. 🧩 **Kısmi / Artımlı Küme Özeti (Incremental Summaries):** `dirtyCamps` takibi ve snapshot zaman damgalı yarış durumu koruması.
10. 🛑 **RPD Kota Yönetimi & Circuit Breaker:** Gemini 429 RESOURCE_EXHAUSTED RPD kotası dolduğunda 0-retry ve <1ms içinde anında kural tabanlı (rule-based) fallback özet üretimi.
11. ⚡ **Süreç Kararlılığı & Graceful Shutdown:** Beklenmeyen hatalarda HTTP/Socket kilitlerini kapatıp DB yazmalarını flush eden ve `process.exit(1)` ile süreci temizce kapatan `gracefulShutdown` mimarisi (`node --watch` ve PM2 uyumlu).

---

## 📦 CompDemocracy OpenData Oturumları

[compdemocracy/openData](https://github.com/compdemocracy/openData) açık veri reposundaki en yüksek katılımlı 5 kamusal müzakere oturumu sisteme entegre edilmiştir:

| Oturum Kodu | Başlık & Konu | Katılımcı Sayısı | Oy Sayısı |
|---|---|---|---|
| **`BG2050`** | **Bowling Green 2050 Vizyonu & Gönüllülük** | 7.886 | 1.034.363 |
| **`MARCHON`** | **Operation Marching Orders Vatandaş İnisiyatifi** | 6.289 | 536.984 |
| **`KLIMA22`** | **Avusturya İklim Konseyi 2022 (Klimaticket)** | 3.142 | 307.778 |
| **`AMASSEM`** | **American Assembly Kent Yönetimi & Altyapı** | 2.031 | 226.148 |
| **`VTAIWAN`** | **vTaiwan UberX & Dijital Paylaşım Ekonomisi** | 1.921 | 49.997 |

---

## 🛠 Teknoloji Yığını

| Katman | Teknoloji | Açıklama |
|--------|-----------|----------|
| **Frontend** | React 18 + Vite 5 | SPA mimarisi, JSX bileşenleri |
| **Stil & Tasarım** | Vanilla CSS (Swiss Bento) | Asimetrik grid düzeni, dark theme, responsive CSS |
| **Grafik & Görselleştirme** | Recharts | Kutuplaşma trendi zaman serisi grafikleri |
| **Diller & i18n** | JavaScript (ES6+) | TR/EN dinamik dil desteği |
| **Backend** | Express 4 + Node.js (ESM) | REST API & Graceful Shutdown sunucusu |
| **Gerçek Zamanlı** | Socket.io 4 | Çift yönlü WebSocket canlı veri akışı |
| **Veritabanı** | PostgreSQL / Prisma | İlişkisel veri modeli ve In-Memory kalıcılık katmanı |
| **LLM Entegrasyonu** | Google Gemini API / OpenAI SDK | `gemini-2.5-flash-lite`, batching, RPD fallback |
| **Kimlik & Güvenlik** | JWT + Bcrypt | Sıkı BOLA koruması, yetkilendirme matrisi |
| **Test** | Vitest 1.6 | 13 test dosyası (116/116 PASSING) |

---

## 🗺️ Proje Mimarisi

```text
cekrepo/test/
├── .env.example                       # Örnek Ortam Değişkenleri Yapılandırması
├── vitest.config.js                   # Vitest Test Çalıştırıcı Yapılandırması
├── PROJECT_PROGRESS.md                # Kapsamlı Proje İlerleyiş Tarihçesi
├── package.json                       # Bağımlılıklar ve Scriptler
├── prisma/
│   ├── schema.prisma                  # PostgreSQL Veritabanı Şeması
│   └── seed.js                        # Master Admin ve Seed Veri Yükleme
├── server/
│   ├── index.js                       # Express & Socket.io Sunucusu + Graceful Shutdown
│   ├── database.js                    # In-Memory & Prisma DB Adapter + Önbellek
│   ├── algorithms.js                  # PCA, K-Means, Köprü Cümle & Kamp Açıklama Motoru
│   ├── middleware/
│   │   └── auth.middleware.js         # JWT, Moderatör ve BOLA Güvenlik Katmanı
│   ├── services/
│   │   ├── llm.service.js             # LLM API, Batch Özetleme & RPD Fallback Servisi
│   │   └── quality.service.js         # Çok Dilli Gerekçe Kalite Skorlama Servisi
│   └── tests/                         # 13 Test Dosyası (116 Test)
│       ├── setup.js                   # Global Vitest Mock & Dry-Run Yapılandırması
│       ├── analysis.test.js
│       ├── authorization-matrix.test.js
│       ├── camp-explanation.test.js
│       ├── camp-explanation-paths.test.js
│       ├── entrypoint-integration.test.js
│       ├── graceful-shutdown.test.js
│       ├── llm-rpd-quota-fallback.test.js
│       ├── math-correctness.test.js
│       ├── minority-insights-shield.test.js
│       ├── mutation-threshold.test.js
│       ├── paused-session.test.js
│       └── polarisability.test.js
└── src/
    ├── App.jsx                        # Ana React Uygulama Bileşeni & Socket Yönetimi
    ├── index.css                      # Swiss Bento Grid & Dark Theme Tasarım Sistemi
    └── components/
        ├── AdminDashboard.jsx         # Yönetici Paneli & Polarization History Chart
        ├── LiveScreen.jsx             # Canlı Ekran & Minority Insights Panel
        ├── Lobby.jsx                  # Masa Giriş ve Rumuz Belirleme Ekranı
        ├── Participant.jsx            # Katılımcı Masası & Şeffaflık Paneli
        └── ReportView.jsx             # Oturum İstatistik Rapor Görünümü
```

---

## 🚀 Kurulum & Çalıştırma

```bash
# 1. Depoyu klonla ve dizine geç
git clone https://github.com/gokhankotan/test2.git
cd test2

# 2. Bağımlılıkları yükle
npm install

# 3. Ortam değişkenlerini yapılandır (.env.example dosyasından .env kopyala)
cp .env.example .env

# 4. Geliştirme sunucularını başlat (Frontend + Backend)
npm run dev

# 5. CompDemocracy Top 5 Açık Veri Oturumlarını Yükle (Opsiyonel)
node server/seed_open_data.js
```

Vite geliştirme sunucusu `http://localhost:5173` adresinde, Express backend ise `http://localhost:3001` adresinde çalışacaktır.

---

## ⚙️ Ortam Değişkenleri (`.env`)

```ini
# Sunucu ve JWT Yapılandırması
PORT=3001
JWT_SECRET=kamusal_alan_gizli_anahtar
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/muzakeredb?schema=public"

# LLM Yapılandırması
LLM_API_KEY=your_gemini_or_openai_api_key_here
LLM_MODEL=gemini-2.5-flash-lite
LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
LLM_DRY_RUN=false

# Eşik ve Tolerans Ayarları
MUTATION_THRESHOLD_VOTES=5
MUTATION_THRESHOLD_OPINIONS=2
MINORITY_MIN_SCORE=25
MINORITY_MIN_VOTES=3
```

---

## 📖 Kullanım Kılavuzu

### Katılımcı Kullanımı
* **Masa Girişi:** Oturum kodunu (`BG2050`, `KLIMA22`, `DEFAULT` vb.) girin ve rumuzunuzu belirleyin.
* **Görüş Bildirme & Oylama:** Katılıyorum, Kararsızım veya Katılmıyorum oyları verin.
* **Şeffaflık Paneli:** "Neden bu gruptayım?" butonuna tıklayarak sizi bulunduğunuz kampa yaklaştıran belirleyici oylarınızı görüntüleyin.

### Yönetici Paneli
* **Giriş Bilgileri:** `admin@muzakere.local` / `admin123`
* **Meta-Analiz Seçimi:** `BG2050`, `KLIMA22`, `VTAIWAN`, `MARCHON` veya `AMASSEM` oturumlarını tek tıkla inceleyin.
* **Kutuplaşma Trendi:** Zaman içindeki kutuplaşma skoru değişimini Recharts grafik alanı üzerinden canlı izleyin.

---

## 🧪 Test & Doğrulama (116 / 116 PASSING)

Projedeki tüm birim, entegrasyon ve güvenlik testlerini çalıştırmak için:

```bash
npm run test
```

| Test Dosyası | Açıklama | Test Sayısı | Durum |
| :--- | :--- | :---: | :--- |
| `polarisability.test.js` | PCA ve Kutuplaşma Skorlama Birim Testleri | 6 | ✅ BAŞARILI |
| `math-correctness.test.js` | K-Means Kümeleme & Matris İndirgeme Testleri | 7 | ✅ BAŞARILI |
| `analysis.test.js` | Köprü Cümle ve Konsensüs Analiz Doğrulaması | 12 | ✅ BAŞARILI |
| `authorization-matrix.test.js` | Sıkı Yetkilendirme & RBAC Matris Koruması | 18 | ✅ BAŞARILI |
| `paused-session.test.js` | Duraklatılmış Oturum Katılımcı Kısıtlamaları | 5 | ✅ BAŞARILI |
| `camp-explanation.test.js` | Şeffaflık Paneli & Sıkı BOLA JWT Koruması | 5 | ✅ BAŞARILI |
| `camp-explanation-paths.test.js` | Şeffaflık Paneli Fast/Slow Path Önbellek Performansı | 12 | ✅ BAŞARILI |
| `minority-insights-shield.test.js` | Azınlık Görüşü Koruması & Min Oy Eşiği | 4 | ✅ BAŞARILI |
| `mutation-threshold.test.js` | Anlamlı Değişim Eşiği & Çift Sayım Önleme | 4 | ✅ BAŞARILI |
| `llm-rpd-quota-fallback.test.js` | LLM RPD Kota & Circuit Breaker Fallback | 5 | ✅ BAŞARILI |
| `graceful-shutdown.test.js` | Graceful Shutdown & Process Exit Güvenliği | 1 | ✅ BAŞARILI |
| `entrypoint-integration.test.js` | Sunucu Giriş Noktası & LLM Entegrasyonu | 2 | ✅ BAŞARILI |
| `setup.js` | Global Vitest Mock & Dry-Run Yapılandırması | - | ✅ BAŞARILI |
| **TOPLAM** | **Bütünsel Test Paketi (`npx vitest run`)** | **116** | **✅ %100 BAŞARILI** |

---

## 📄 Lisans

Bu proje eğitim, akademik araştırma ve açık kamu müzakereleri için geliştirilmiş açık kaynaklı bir platformdur.
