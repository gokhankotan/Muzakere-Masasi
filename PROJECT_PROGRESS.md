# ⚖️ Müzakere Masası — Proje İlerleyiş Tarihçesi ve Görev Takibi (PROJECT_PROGRESS.md)

Bu doküman, Müzakere Masası projesinin başlangıçtan itibaren geçirmiş olduğu tüm geliştirme aşamalarını, mimari kararları, eklenen özellikleri ve mevcut durumunu adım adım kayıt altında tutmak amacıyla oluşturulmuştur.

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
  - `openai` npm paketi ile kurumsal LLM API çağrısı.
  - Her fikir kümesinin oyladığı görüşlerden 1-2 cümlelik Türkçe grup özeti üretilmesi.
  - Ortam değişkenleri tanımlı değilse veya sunucu erişilemezse otomatik kural tabanlı (rule-based) fallback özetleri.
- [x] **Sonuç Raporu (JSON Export & Yazdırma Görünümü)**
  - `GET /api/sessions/:code/report` endpoint'i: Oturum özetini, istatistikleri, kampları, köprü cümlelerini ve tüm görüşleri detaylı JSON olarak indirilebilir formatta sunar.
  - Frontend header'a "📄 JSON Rapor" ve "🖨️ Yazdır" butonları eklendi.
- [x] **Docker Compose PostgreSQL Altyapısı (`docker-compose.yml`)**
  - PostgreSQL 16 Alpine container tanımı.
- [x] **Vitest ile Birim Testleri (`server/tests/`)**
  - 45/45 birim testi hatasız çalışmaktadır.

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

## ⚡ Aşama 7: LLM API Kullanımı ve Kota Optimizasyonu (Son Aşama)

- [x] **1. In-Memory Result Caching (`server/services/llm.service.js`)**
  - SHA256 veri özeti tabanlı `llmCache` önbellek katmanı. Aynı veri için LLM API çağrısı atlanarak milisaniyeler içinde cached yanıt verilir (`⚡ [LLM CACHE HIT]`).
- [x] **2. Batched Cluster Summary Requests (`generateAllClusterSummaries`)**
  - Oturumdaki N adet küme özeti tek bir batched JSON API çağrısıyla alınarak N çağrı 1'e indirgendi (`🌐 [LLM BATCH CALL]`).
- [x] **3. Frontend & Backend Button Spam Protection**
  - `AdminDashboard.jsx` üzerinde `useRef` 1000ms debounce koruması ve yükleniyor kilidi.
  - `server/index.js` üzerinde `inFlightConsensusLocks` ile aynı oturuma gelen eşzamanlı isteklerin birleştirilmesi (`🔒 [LLM IN-FLIGHT DEDUP]`).
- [x] **4. Exponential Backoff & Retry Cap (`executeLlmWithRetry`)**
  - 1s, 2s üstel bekleme ve maks 2 retry limiti. Cap dolduğunda anında kural tabanlı fallback engine çalışır.
- [x] **5. Model Name & 404/401 Error Validation**
  - Model konfigürasyonu açılışta loglanır. 404 (NotFound) veya 401 (Unauthorized) hatalarında deneme harcamadan anında fallback'e geçilir.
- [x] **6. Idempotent Seed Import (`server/seed_open_data.js`)**
  - Önceden seed edilmiş oturumların saklanan LLM içerikleri veritabanından okunur, seed sırasında 0 LLM API çağrısı yapılır (`⚡ [SEED IDEMPOTENT]`).

---

## 🧪 Test ve Doğrulama Durumu

| Test Adı | Açıklama | Durum |
| :--- | :--- | :--- |
| Vitest PCA | PCA matris indirgeme birim testi (`polarisability.test.js`) | ✅ BAŞARILI |
| Vitest K-Means | K-Means kümeleme birim testi (`math-correctness.test.js`) | ✅ BAŞARILI |
| Vitest Köprü Cümle | Köprü Cümle kuralı doğrulama birim testi (`analysis.test.js`) | ✅ BAŞARILI |
| Idempotent Seed | Saklanan LLM içeriklerini kullanıp 0 API çağrısı yapma | ✅ BAŞARILI |
| LLM Result Cache | Değişmeyen verilerde önbellekten anında yanıt dönme | ✅ BAŞARILI |
| Batched Summaries | N küme özetini 1 API isteğinde topluca üretme | ✅ BAŞARILI |
| Arayüz Derlemesi | `npx vite build` ile 0 hatasız üretim derlemesi alabilme | ✅ BAŞARILI |
