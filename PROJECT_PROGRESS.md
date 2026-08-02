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
  - `runAnalysis` fonksiyonuna entegre edildi — küme özetleri artık LLM'den veya fallback'ten geliyor.
- [x] **Sonuç Raporu (JSON Export & Yazdırma Görünümü)**
  - `GET /api/sessions/:code/report` endpoint'i: Oturum özetini, istatistikleri, kampları, köprü cümlelerini ve tüm görüşleri detaylı JSON olarak indirilebilir formatta sunar.
  - Frontend header'a "📄 JSON Rapor" ve "🖨️ Yazdır" butonları eklendi.
  - `@media print` CSS kuralları ile baskıya uygun beyaz-arka planlı, temiz rapor görünümü.
- [x] **Docker Compose PostgreSQL Altyapısı (`docker-compose.yml`)**
  - PostgreSQL 16 Alpine container tanımı, kalıcı volume ile veri koruması.
- [x] **Vitest ile Birim Testleri (`server/tests/`)**
  - PCA matris indirgeme testi (`polarisability.test.js`).
  - K-Means kümeleme ve matematiksel doğruluk testi (`math-correctness.test.js`).
  - Köprü Cümle kuralı testi ve analiz motoru doğrulaması (`analysis.test.js`).
  - 45/45 birim testi hatasız çalışmaktadır.

---

## 🎨 Aşama 5: Swiss Bento Grid Tasarım Sistemi & Arayüz Mimarisi

- [x] **Swiss International Grid & Bento Modularity**
  - İsviçre tipografik disiplini (Inter / Outfit), rasyonel asimetrik grid düzeni ve neutral renk paleti.
  - Çift UI Modu desteği (`muzakere_ui_mode`: `"modern"` vs `"classic"`). Header'daki `✨ UI: Swiss Bento` butonu ile anında geçiş olanağı.
- [x] **Neo-Brutalist Köprü Görüş Vurgusu**
  - Ortak uzlaşı cümleleri için 2.5px solid çerçeve, `#2563EB` sol mavi vurgu bandı ve `⚡ KÖPRÜ GÖRÜŞ (ORTAK MUTABAKAT)` rozeti tanımlandı (`.bridge-accent-card`).
- [x] **Nötr Eşit Ağırlıklı Oylama Butonları**
  - `.btn-agree`, `.btn-disagree`, `.btn-pass` sınıfları ile gruplar arası görsel önyargıyı engelleyen nötr renk paleti ve yüksek okunabilirlik.
- [x] **Giriş Ekranı (Lobby) Temizliği & Hizalama**
  - Giriş ekranından Habermas tanıtım yazısı ve 3 özellik kartı kaldırıldı.
  - Form kartı dikey ve yatay olarak ekran ortasına hizalandı. Formun üzerine sade "Müzakere Masası'na Hoş Geldiniz" başlığı ve alt metni eklendi.
- [x] **3-Sütunlu Matematiksel Header Mimarisi**
  - `grid-template-columns: 1fr auto 1fr` ile header elemanları hizalandı:
    - **Sol Üst (`.header-left`):** Sunucu Bağlantı Durumu (`Bağlı` yeşil nokta rozeti).
    - **Tam Merkez (`.header-center`):** Geometrik Swiss müzakere SVG logosu + "Müzakere Masası" başlığı + Navigasyon sekmeleri.
    - **Sağ Üst (`.header-right`):** `TR`/`EN` dil seçici, `🌙 Koyu`/`☀️ Açık` tema toggle, `✨ UI: Swiss Bento` modu seçici.
- [x] **Yönetici Paneli (Admin Dashboard) Bento Grid Dengelemesi**
  - Çift sütunlu Bento Grid kartları eşit yüklendi:
    - **Sol Sütun:** Masa Durumu Kontrolü → Uzlaşı Potansiyeli Keşif Paneli → Fikir Kümeleme & Kamp Ayarları (K değeri seçici) → Simülasyon Paneli.
    - **Sağ Sütun:** Görüş Moderasyon Kuyruğu (En üst) → Müzakere Masası Konusu (Soru editörü) → Aktif Katılımcılar Listesi → Tehlikeli Bölge.

---

## 📦 Aşama 6: CompDemocracy OpenData En Çok Katılımlı Top 5 Oturum İçe Aktarımı

- [x] **GitHub OpenData Repo Taraması**
  - `compdemocracy/openData` reposundan en yüksek katılımcı sayısına sahip projeye uygun 5 kamusal müzakere veri seti entegre edildi:
    1. **`BG2050`**: Bowling Green 2050 Vizyonu & Gönüllülük (7.886 Katılımcı, 1.034.363 Oy)
    2. **`MARCHON`**: Operation Marching Orders Vatandaş İnisiyatifi (6.289 Katılımcı, 536.984 Oy)
    3. **`KLIMA22`**: Avusturya İklim Konseyi 2022 (3.142 Katılımcı, 307.778 Oy)
    4. **`AMASSEM`**: American Assembly Kent Yönetimi & Altyapı (2.031 Katılımcı, 226.148 Oy)
    5. **`VTAIWAN`**: vTaiwan UberX & Dijital Paylaşım Ekonomisi (1.921 Katılımcı, 49.997 Oy)
- [x] **Otomatik Veri İçe Aktarımı (`server/seed_open_data.js`)**
  - CSV indirici, 2D PCA indirgeme, K-Means kümeleme, Kutuplaşma derecesi (%) ve Köprü Görüş analizleri otomatik çalıştırılarak veritabanına tohumlandı.

---

## 🔍 Aşama 7: Dynamic Consensus Engine & Backend Senkronizasyonu

- [x] **Dinamik Rule-Based Uzlaşı Keşif Motoru (`server/services/llm.service.js`)**
  - LLM kotaları dolduğunda veya API ulaşılamadığında çalışan sabit hardcoded fallback yerine, oturumun **kendi özel sorusu (`question`)**, **aktif fikir kampları (`camps`)** ve **top oy alan görüşlerini (`topOpinions`)** işleyen `generateRuleBasedConsensusFallback` fonksiyonu yazıldı.
  - Her oturum (`BG2050`, `KLIMA22`, `MARCHON`, `AMASSEM`, `VTAIWAN`) kendi verilerine dayalı %100 benzersiz uzlaşı keşif analizi üretmektedir.
- [x] **Oturum Geçişlerinde Anlık Veri Senkronizasyonu (`server/index.js` & `AdminDashboard.jsx`)**
  - `admin-join` Socket.io olayına `session-state` ve `analysis-updated` yayınları eklendi. Admin panelinde listeden farklı bir oturum seçildiğinde başlık, soru, kamplar ve analiz verileri anında güncellenir.
  - Oturum değiştirildiğinde `AdminDashboard.jsx` üzerindeki `consensusResult` ve `consensusError` durumları otomatik sıfırlanır.

---

## 🧪 Test ve Doğrulama Durumu

| Test Adı | Açıklama | Durum |
| :--- | :--- | :--- |
| Public Erişim | PUBLIC oturumlara şifresiz katılım | ✅ BAŞARILI |
| Şifreli Giriş | PASSWORD_PROTECTED oturuma doğru şifre ile katılım | ✅ BAŞARILI |
| Rate Limiting | 5 hatalı şifre denemesinde 15 dk kilitlenme (HTTP 429) | ✅ BAŞARILI |
| Yerleşik Moderasyon | Moderatörün görüş onaylaması ve canlı oylamaya düşmesi | ✅ BAŞARILI |
| Vitest PCA | PCA matris indirgeme birim testi (`polarisability.test.js`) | ✅ BAŞARILI |
| Vitest K-Means | K-Means kümeleme birim testi (`math-correctness.test.js`) | ✅ BAŞARILI |
| Vitest Köprü Cümle | Köprü Cümle kuralı doğrulama birim testi (`analysis.test.js`) | ✅ BAŞARILI |
| OpenData Seed | Top 5 CompDemocracy açık veri setinin DB'ye tohumlanması | ✅ BAŞARILI |
| Dynamic Consensus | Her oturum için benzersiz kural tabanlı uzlaşı keşfi üretimi | ✅ BAŞARILI |
| Arayüz Derlemesi | `npx vite build` ile 0 hatasız üretim derlemesi alabilme | ✅ BAŞARILI |

---

## 📂 Dosya Yapısı Haritası

- `server/index.js` — Express REST API, Socket.io olayları (`admin-join` senkronizasyonu), `/discover-consensus` rotası.
- `server/services/llm.service.js` — OpenAI entegrasyonu, `discoverConsensusPotential` ve dinamik `generateRuleBasedConsensusFallback` motoru.
- `server/seed_open_data.js` — Top 5 CompDemocracy açık veri seti indirici ve DB tohumlayıcı.
- `server/algorithms.js` — PCA (NIPALS), K-Means ve Köprü Cümle tespit algoritmaları.
- `server/tests/` — 45/45 geçen Vitest analiz ve doğruluk birim testleri.
- `src/App.jsx` — 3-Sütunlu Header yerleşimi, UI mod yönetimi (`modern`/`classic`), Socket.io dinleyicileri.
- `src/App.css` — Swiss International grid CSS token'ları, Bento grid kuralları, `.bridge-accent-card` stilleri.
- `src/components/Lobby.jsx` — Dikey/yatay ortalanmış karşılama ve oturum giriş ekranı.
- `src/components/Participant.jsx` — Nötr oylama kartları, Görüş Havuzu ve 2D scatter plot.
- `src/components/AdminDashboard.jsx` — Dengelenmiş 2 sütunlu Bento Grid, Uzlaşı Potansiyeli Keşif paneli, Oturum düzenleme ve Meta-Analiz tablosu.
- `src/components/LiveScreen.jsx` — Neo-Brutalist vurgulu köprü cümle kartlarıyla canlı projeksiyon ekranı.
- `src/components/ReportView.jsx` — Baskıya uygun kurumsal sonuç raporu görünümü.
