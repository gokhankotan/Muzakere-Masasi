# ⚖️ Müzakere Masası — Proje İlerleyiş Tarihçesi ve Görev Takibi (PROJECT_PROGRESS.md)

Bu doküman, Müzakere Masası projesinin başlangıçtan itibaren geçirmiş olduğu tüm geliştirme aşamalarını, mimari kararları, eklenen özellikleri, performans optimizasyonlarını, güvenlik düzeltmelerini ve güncel test durumunu adım adım kayıt altında tutmak amacıyla oluşturulmuştur.

---

## 📌 Proje Özeti ve Amacı

- **Kuram**: Jürgen Habermas'ın Kamusal Alan ve İdeal Konuşma Durumu teorisi (Eşit katılım, gerekçelendirme, samimiyet, tarafsızlık).
- **Problem**: Sosyal medya platformlarının uzlaşıyı değil kutuplaşmayı ve çatışmayı ödüllendirmesi. Klasik anketlerin ise "neden" ve "kimlerle birlikte" sorularını ölçememesi.
- **Çözüm**: Katılımcıların kısa görüş yazıp diğer görüşleri oyladığı; oy örüntülerinden PCA + K-Means ile fikir kamplarının (küme) çıkarıldığı ve farklı grupların ortak onayladığı "Köprü Cümleler"in (konsensüs) canlı olarak tespit edildiği dijital müzakere platformu.

---

## 🚀 Aşama 1: Temel Prototip ve Analiz Motoru Kurulumu

- [x] **Backend Altyapısı (Express & Socket.io)**
  - Express.js HTTP REST API sunucusu kuruldu.
  - Socket.io entegrasyonu ile oyların ve yeni fikirlerin tüm istemcilere saniyelik yayınlanması sağlandı.
  - Veritabanı bağlantısı olmasa dahi çalışan In-Memory Data Store (çevrimdışı/demo modu) yedekleme mekanizması geliştirildi.
- [x] **Matematik ve Kümeleme Motoru**
  - Katılımcı oylarının matrix formuna getirilip `ml-pca` ile 2 boyutlu (2D) koordinat düzlemine indirgenmesi.
  - `ml-kmeans` ile 2 boyutlu düzlemdeki katılımcıların oy benzerliklerine göre gruplara (kamplara) ayrılması.
  - **Köprü Cümle Formülü**: Her kampa dahil üyelerin `> %60` onayını alan ve toplam katılımcıların `≥ %30`'u tarafından oylanan cümlelerin süzülmesi.
- [x] **Frontend Arayüzü (React + Vite + Vanilla CSS)**
  - Glassmorphism ve dark mode odaklı, modern visual tasarım sistemi (`index.css`).
  - Google Fonts Inter & Outfit tipografisi entegrasyonu.
  - **Katılımcı Masası**: Görüş yazma formu ve `Katılıyorum / Kararsızım / Katılmıyorum` oylama kartları.
  - **Canlı Harita & Uzlaşı Dashboard**: 2D Scatter plot ile katılımcıların anlık harita konumları, fikir grupları özetleri ve köprü cümle paneli.
  - **Çalıştırma Scripti**: Paralel başlatma sağlayan `run.ps1` PowerShell scripti.

---

## 🛡️ Aşama 2: Güvenlik, Veri Modeli ve Yönetici Katmanı

- [x] **Prisma & Veritabanı Şeması (`schema.prisma`)**
  - `Admin` modeli eklendi (Email, Bcrypt passwordHash).
  - `Visibility` enum (`PUBLIC`, `PASSWORD_PROTECTED`) tanımlandı.
  - `Session` modeline `visibility`, `passwordHash`, `passwordUpdatedAt` ve `creatorId` alanları eklendi.
  - `prisma/seed.js` scripti ile `admin@muzakere.local` / `admin123` varsayılan admin hesabı oluşturuldu.
- [x] **Güvenlik & Yetkilendirme Middleware'leri (`auth.middleware.js`)**
  - `bcrypt` (cost factor 12) ile güvenli şifre hashleme.
  - `authenticateAdmin`: Platform admin JWT doğrulama (`type:'admin'`).
  - `checkParticipantAccess`: Şifreli oturumlar için `type:'participant_access'` JWT doğrulama ve `passwordUpdatedAt` ile token iptal kontrolü.
  - `passwordRateLimiter`: IP başına 5 başarısız denemede 15 dakika kilit (`express-rate-limit`).
- [x] **Yönetici İşlevleri ve Owner Check**
  - `POST /api/admin/login`: Admin girişi.
  - `POST /api/sessions`: Adminlerin oturum oluşturması.
  - `PATCH /api/sessions/:code/password`: Sadece oturumu oluşturan adminin (`session.creatorId === adminId`) şifre/görünürlük değiştirebilmesi.

---

## 🛠️ Aşama 3: Herkese Açık Oturum Oluşturma & Yerleşik Moderatörlük

- [x] **Herkese Açık Oturum Oluşturma Endpoint'i (`POST /api/sessions/create`)**
  - Giriş yapan veya yapmayan herhangi bir kullanıcının başlık, açıklama, rumuz ve Public/Private tercihiyle yeni masa açabilmesi.
  - Benzersiz 6 karakterli oturum kodu (`generateUniqueSessionCode`) üretimi.
  - Oluşturan kullanıcıya özel 24 saat geçerli `type:'moderator'` JWT token'ı verilmesi ve `localStorage` üzerinde `moderator_token_<code>` olarak saklanması.
- [x] **Bypass ve Moderatör Yetkilendirmesi**
  - `checkModerator` middleware'i yazıldı.
  - `checkParticipantAccess` middleware'i, kendi oluşturduğu şifreli oturuma giren moderatörlerin şifre kontrolünü otomatik bypass etmesini sağladı.
  - `PATCH /api/sessions/:code/password` endpoint'i hem platform adminlerini hem de oturum moderatörlerini destekleyecek şekilde güncellendi.
- [x] **Fikir Moderasyon Akışı**
  - `POST /api/sessions/:code/opinion`: Yeni gönderilen görüşler varsayılan olarak `PENDING` durumunda kaydedilir.
  - `PATCH /api/sessions/:code/opinions/:id/status`: Moderatörün görüşleri `APPROVED` veya `REJECTED` olarak işaretlemesi.
  - Katılımcıların yalnızca onaylanan (`APPROVED`) görüşleri oylayabilmesi ve harita analizine sadece onaylı görüşlerin dahil edilmesi.
  - Socket.io `opinion_moderated` olayı ile tüm istemcilerin canlı güncellenmesi.

---

## 🧠 Aşama 4: LLM Entegrasyonu, Sonuç Raporu, Docker & Birim Testleri

- [x] **LLM Küme Dili Özeti Servisi (`server/services/llm.service.js`)**
  - `openai` npm paketi ile kurumsal LLM API çağrısı (`gemini-2.5-flash-lite` / `gpt-4o-mini`).
  - Her fikir kümesinin oyladığı görüşlerden 1-2 cümlelik Türkçe grup özeti üretilmesi.
  - Ortam değişkenleri tanımlı değilse veya sunucu erişilemezse otomatik kural tabanlı (rule-based) fallback özetleri.
- [x] **Sonuç Raporu (JSON Export & Yazdırma Görünümü)**
  - `GET /api/sessions/:code/report` endpoint'i: Oturum özetini, istatistikleri, kampları, köprü cümlelerini ve tüm görüşleri detaylı JSON olarak indirilebilir formatta sunar.
  - Frontend header'a "📄 JSON Rapor" ve "🖨️ Yazdır" butonları eklendi.
- [x] **Docker Compose PostgreSQL Altyapısı (`docker-compose.yml`)**
  - PostgreSQL 16 Alpine container tanımı.

---

## 🎨 Aşama 5: Swiss Bento Grid Tasarım Sistemi & Arayüz Mimarisi

- [x] **Swiss International Grid & Bento Modularity**
  - İsviçre tipografik disiplini (Inter / Outfit), rasyonel asimetrik grid düzeni ve neutral renk paleti.
  - Çift UI Modu desteği (`muzakere_ui_mode`: `"modern"` vs `"classic"`).
- [x] **Neo-Brutalist Köprü Görüş Vurgusu**
  - Ortak uzlaşı cümleleri için 2.5px solid çerçeve, `#2563EB` sol mavi vurgu bandı (`.bridge-accent-card`).
- [x] **3-Sütunlu Matematiksel Header Mimarisi**
  - `grid-template-columns: 1fr auto 1fr` ile sol üstte sunucu durumu, tam ortada logo + nav, sağ üstte kontroller.
- [x] **Yönetici Paneli Bento Grid Dengelemesi**
  - Çift sütunlu Bento Grid kartları tam eşit yüksekliğe getirildi.

---

## 📦 Aşama 6: CompDemocracy OpenData En Çok Katılımlı Top 5 Oturum İçe Aktarımı

- [x] **Top 5 Açık Veri Entegrasyonu (`BG2050`, `MARCHON`, `KLIMA22`, `AMASSEM`, `VTAIWAN`)**
  - CompDemocracy reposundaki en büyük 5 veri seti veritabanına aktarıldı.

---

## ⚡ Aşama 7: Olay Odaklı LLM Önbellek İptali ve Veritabanı Kalıcılığı

- [x] **1. Oturum Mutation & Version Takibi (`markSessionMutated`)**
  - Yeni görüş ekleme, görüş onaylama/reddetme, oy verme, soru değiştirme ve kamp ayarı değiştirme işlemlerinde `sessionVersion` artırılır.
- [x] **2. Önbellek Anahtarının Oturum Sürümüne Bağlanması (`consensus-discovery:CODE:vVersion`)**
  - Değişiklik yoksa `⚡ [LLM CACHE HIT — NO SESSION CHANGES]` verilerek 0 token harcanır.
- [x] **3. Değişiklik Anında Doğrudan Önbellek İptali (`invalidateLlmCacheForSession`)**
  - Mutation anında ilgili oturumun eski LLM önbellek kayıtları silinir.
- [x] **4. Yönetici Paneline Veri Tazeliği Göstergesi (`AdminDashboard.jsx`)**
  - `🟢 Veri Güncel (Önbellekten — 0 Token)` veya `🟠 Yeni veri mevcut — Analiz güncellenebilir` rozeti.
- [x] **5. Sunucu Restart Sonrası Veritabanı Önbellek Kalıcılığı (`loadSessionsFromDB`)**
  - Veritabanındaki `session.analysis` nesnesinden önbellek geri yüklenerek restart sonrası 0 token harcanır.

---

## 💎 Aşama 8: LLM API Kullanım Optimizasyonu & Güvenliği

- [x] **Sonuç Önbellekleme Katmanı (`getFromLlmCache` / `setInLlmCache`)**
  - SHA-256 hash ve oturum sürüm numarasına bağlı bellek içi önbellekleme mimarisi.
- [x] **Toplu (Batch) Küme Özeti Üretimi (`generateAllClusterSummaries`)**
  - Her bir kamp için ayrı ayrı HTTP isteği atmak yerine, oturumdaki tüm dirty kampları tek bir prompt ve tek bir LLM API çağrısı ile özetleme.
- [x] **Spam & Yarış Durumu Koruması (`inFlightConsensusLocks`)**
  - İstemcilerden aynı anda gelen üst üste analiz isteklerini kilitleyerek mükerrer LLM çağrılarını engelleme.
- [x] **Exponential Backoff ve Retry Cap**
  - Geçici ağ hatalarında maksimum 2 deneme (1s ve 2s gecikmeli) sınırı.
- [x] **Model ve Base URL Doğrulaması**
  - `gemini-2.5-flash-lite` ve OpenAI uç noktası standartlaştırması.

---

## 🔄 Aşama 9: Olay Bazlı Cache Invalidation ve Veritabanı Kalıcılığı

- [x] **Mutasyon Versiyonlama Sistemi (`sessionVersions`)**
  - `markSessionMutated(sessionCode, mutationType)` ile her oy, görüş ve moderasyon hareketinde oturum versiyonunun artırılması.
- [x] **Deterministik Cache İptali (`invalidateLlmCacheForSession`)**
  - Oturum sürümleri değiştiğinde bayat önbelleklerin otomatik olarak temizlenmesi.
- [x] **Admin UI Canlı Tazelik Göstergesi**
  - Admin paneline anlık önbellek ve mutasyon durumunu gösteren rozet eklenmesi.

---

## 📊 Aşama 10: Anlamlı Değişim Eşiği (Mutation Threshold System)

- [x] **Yapılandırılabilir Sayaçlar (`MUTATION_THRESHOLD_VOTES`, `MUTATION_THRESHOLD_OPINIONS`)**
  - Belirli sayıda oy (default: 5) veya görüş (default: 2) birikmeden pahalı LLM çağrılarını tetiklemeyen eşik sistemi (`pendingVotes` & `pendingOpinions`).
- [x] **Bypass Mekanizması**
  - Görüş silme, kamp sayısı değiştirme veya manuel re-analyze durumlarında eşiği beklemeden anında çalıştırma (`forceLLM: true`).
- [x] **Çift Sayım Düzeltmesi**
  - `addStatement` esnasında onay bekleyen görüşlerin sayacı artırmasını önleyip, yalnızca `approveStatement` anında sayacın +1 artırılması.

---

## 🧩 Aşama 11: Kısmi / Artımlı Küme Özeti (Incremental Cluster Summaries)

- [x] **Dirty Camps Mekanizması (`markCampDirty` / `getDirtyCamps`)**
  - Katılımcı yer değişimi meydana gelen kampların tespit edilerek sadece o kampların LLM'e gönderilmesi.
- [x] **Snapshot Bazlı Yarış Durumu Önlemi (`clearDirtyCamps`)**
  - LLM API çağrısı sırasında gelen yeni mutasyonların kaybolmasını önlemek için zaman damgalı snapshot temizliği.
- [x] **Yapısal Değişiklik Sıfırlaması**
  - K değeri veya soru değiştirildiğinde `markAllCampsDirty` ile tüm kampların yeniden özetlenmesi.

---

## 📈 Aşama 12: Kutuplaşma Trendi Zaman Serisi (Polarization History)

- [x] **Olay Bazlı Zaman Serisi Kaydı (`addPolarizationHistoryEntry`)**
  - Katılımcı katılımı, görüş onayı ve oy kullanımlarında anlık kutuplaşma skorunun zaman serisi olarak kaydedilmesi.
- [x] **Circular Buffer Limiti**
  - Oturum başına maksimum 100 zaman serisi kaydının bellekte ve DB'de tutulması.
- [x] **Simülasyon Verisi Ayrıştırma (`isSimulated`)**
  - Bot veya simülasyon adımlarının gerçek katılımcı trend grafiklerini bozmaması için `isSimulated` bayrağı ile işaretlenmesi.
- [x] **Admin Dashboard Recharts Entegrasyonu**
  - Yönetici panelinde zaman içindeki kutuplaşma değişimini gösteren alan grafiği.

---

## 🛡️ Aşama 13: Azınlık Görüşü Koruması (Minority Opinion Shield)

- [x] **Çok Dilli Gerekçe Kalitesi Skorlaması (`quality.service.js`)**
  - Görüş metinlerinin gerekçelendirme kalitesinin Türkçe ve İngilizce dil bağlamında skorlanması (`calculateReasoningQualityScore`).
- [x] **Minimum Oy Eşiği Koruması (`MINORITY_MIN_VOTES = 3`)**
  - Hiç oy almamış (`voteCount: 0`) görüşlerin panelde gösterilmesini tamamen engelleyen oy eşik süzgeci.
- [x] **Akıllı Fallback & UI Bildirimi**
  - Eşiği karşılayan görüş olmadığında boş dizi `[]` dönülerek arayüzde bilgilendirici boş durum mesajının gösterilmesi.
- [x] **Arayüz Entegrasyonları**
  - Katılımcı Masası, Canlı Ekran (`LiveScreen.jsx`), Admin Dashboard ve Rapor görünümlerine Fikir Haritasının hemen altına yerleştirilmesi.

---

## 🔍 Aşama 14: Şeffaflık Paneli ("Neden Bu Gruptayım?") & Sıkı BOLA Koruması

- [x] **Kamp Atama Açıklama Algoritması (`getCampAssignmentExplanation`)**
  - Katılımcının oylarını grubunun oy oranlarıyla ($O(1)$ önbellek / $O(n \times S)$ lazy fallback) karşılaştırarak kampa yaklaşma nedenini çıkaran matematiksel algoritma.
- [x] **Sıkı BOLA Güvenlik Koruması**
  - İstemci tarafından gönderilen `x-participant-id` veya null-token istisnalarının tamamen kaldırılması. Katılımcının JWT token'ındaki `participantId` ile URL'deki `:participantId`'nin birebir eşleşme zorunluluğu (`403 Forbidden`).
- [x] **Token Yaşam Döngüsü Düzeltmesi**
  - Katılımcı rumuz belirlediğinde `register-participant` socket olayı üzerinden `participantId` içeren taze JWT token üretimi ve `localStorage` kalıcılığı.

---

## 🛑 Aşama 15: RPD Kota Yönetimi ve Hata Dayanıklılığı (Circuit Breaker)

- [x] **RPD / RPM Hata Ayrımı (`isRpdExhausted`)**
  - Google Gemini API 429 RESOURCE_EXHAUSTED hatasında günlük istek limiti (RPD) aşımının tespit edilmesi ve devrenin kesilmesi (Circuit Breaker).
- [x] **0-Retry Anında Fallback**
  - RPD kotası dolduğunda üst üste deneme (retry) yapmadan <1ms içinde anında kural tabanlı (rule-based) özet üretilmesi.
- [x] **Uç Nokta Zaman Aşımı Koruması**
  - Frontend `fetch` çağrılarına 15 saniyelik `AbortController` zaman aşımı ve anlaşılır hata mesajı gösterimi.
- [x] **Admin Kota Rozeti**
  - Yönetici panelinde canlı günlük kota durumunun gösterilmesi.

---

## ⚡ Aşama 16: Süreç Kararlılığı ve Güvenli Kapanma (Graceful Shutdown)

- [x] **Graceful Shutdown Mimarisi (`gracefulShutdown`)**
  - Beklenmeyen `uncaughtException` veya `unhandledRejection` durumlarında sunucunun bozuk bellek durumuyla açık kalmasını engellemek için HTTP/Socket bağlantılarının kapatılması, DB yazmalarının beklenmesi ve `process.exit(1)` ile kapanması.
- [x] **Otomatik Yeniden Başlatma Koruması**
  - `package.json` geliştirme scriptinde `node --watch` ve üretimde PM2 / Docker süreç yöneticisi desteği.
- [x] **Birim ve Entegrasyon Testleri (`graceful-shutdown.test.js` & `entrypoint-integration.test.js`)**
  - Süreç kapanış mantığının ve sunucu giriş noktalarının mock'suz entegrasyon doğrulaması.

---

## 🎨 Aşama 17: Tasarım Sistemi ve Bento Grid İnce Ayarları

- [x] **Giriş Ekranı Dikey/Yatay Hizalaması**
  - Katılımcı rumuz giriş ekranının tam ekran ortalanması.
- [x] **3-Sütunlu Header ve Admin Bento Grid Dengelemesi**
  - Yönetici paneli ve canlı ekran Bento kartlarının görsel dengelenmesi.

---

## 🧪 Test ve Doğrulama Durumu (116 / 116 PASSING)

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
| `server/tests/setup.js` | Global Vitest Mock & Dry-Run Yapılandırması | - | ✅ BAŞARILI |
| **TOPLAM** | **Tüm Bütünsel Test Paketi (`npx vitest run`)** | **116** | **✅ %100 BAŞARILI** |

---

## 🗺️ Dosya Yapısı Haritası

```text
cekrepo/test/
├── .env.example                       # Örnek Ortam Değişkenleri Yapılandırması
├── vitest.config.js                   # Vitest Test Çalıştırıcı Yapılandırması
├── PROJECT_PROGRESS.md                # Proje İlerleyiş Tarihçesi ve Dokümantasyon
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
│       ├── setup.js                   # Global Test Setup & OpenAI Client Mock
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
