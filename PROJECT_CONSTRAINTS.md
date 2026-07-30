# PROJECT_CONSTRAINTS.md — Müzakere Masası

> Bu dosya, Antigravity (ve her ajan oturumu) için bağlayıcı proje kısıtlarını içerir.
> Herhangi bir görev verilmeden önce bu dosya referans gösterilmelidir.
> Buradaki kararlar bilinçli tercihlerdir — "daha iyi" bir alternatif önerilse bile
> sapmadan önce insan onayı gerekir.

## 1. Teknoloji Yığını (Değiştirilemez — Onaysız Sapma Yok)

| Katman | Karar | Kesinlikle Kullanılmayacak |
|---|---|---|
| Backend | Node.js + Express | — |
| Gerçek zamanlı iletişim | Socket.io | Ham WebSocket API, ham `ws` kütüphanesi |
| ORM | Prisma | TypeORM, Sequelize, raw SQL |
| Veritabanı | **PostgreSQL** (Docker container, `docker-compose.yml` ile), baştan itibaren | SQLite (geliştirme dahil hiçbir aşamada kullanılmayacak) |
| Analiz motoru (PCA/Kümeleme) | Saf JS/TS: `ml-pca`, `ml-kmeans` | **Python, scikit-learn, herhangi bir Python mikroservisi** |
| LLM entegrasyonu | Kurumun kendi eğittiği model, OpenAI-uyumlu API üzerinden (`openai` npm paketi, `baseURL` kurumun endpoint'ine yönlendirilmiş) | **Gemini API, Claude API, OpenAI'ın kendi bulut servisi** — bunlar kullanılmayacak, sadece kurum içi endpoint'e bağlanılacak |
| Frontend | React 18 + Vite 5, state tabanlı routing (react-router-dom yerine `role` state'i ile görünüm değişimi — mevcut kod tabanının konvansiyonu, değiştirilmeyecek) | Next.js, Vue, Svelte |
| Görselleştirme | Chart.js / react-chartjs-2 (veya mevcut kod tabanındaki özel Canvas/SVG tabanlı 2D scatter — hangisi kullanılıyorsa o korunacak) | **D3.js kullanılmayacak** |
| Stil | Vanilla CSS, glassmorphism (mevcut kod tabanında zaten uygulanmış — bkz. madde 3 notu) | Yeni bir CSS framework/kütüphane eklenmeyecek |
| Kimlik doğrulama (admin) | JWT + bcrypt, **çoklu admin modeli** (`Admin` tablosu) | OAuth, harici auth sağlayıcı, kurumsal SSO, admin self-registration (public kayıt formu) |
| Kimlik doğrulama (katılımcı) | Rumuz (nickname) + session, doğrulama yok (public oturumlarda); **şifreli oturumlarda ek olarak conversation-specific JWT** | E-posta/şifre, SMS doğrulama |
| Rate limiting | `express-rate-limit` (şifre doğrulama endpoint'i için) | Redis tabanlı dağıtık rate limit (bu ölçekte gerek yok) |

## 2. Ortam Değişkenleri (.env şablonu)

```
DATABASE_URL="postgresql://postgres:dev@localhost:5432/muzakere_masasi"
JWT_SECRET=""
LLM_BASE_URL=""       # kurumun verdiği endpoint
LLM_API_KEY=""        # kurumun verdiği anahtar
LLM_MODEL_NAME=""     # kurumun belirttiği model adı
```

## 3. Kapsam Sınırı — Çekirdek (Core) vs Ertelenen (v1.1)

### Çekirdek — Bu Görevde Yapılacak
- Rumuz + session tabanlı katılım
- Görüş yazma (750 karakter sınırı — güncellendi, eski sınır 140-280'di)
- Buton ile oylama (+1 / -1 / 0) — **swipe/kart destesi değil**
- Periyodik (10-30 sn) PCA + KMeans hesaplama, WebSocket ile yayın
- Küme dili özeti (LLM API çağrısı)
- Köprü cümle tespiti (bkz. madde 5)
- Admin panel: oturum açma, oturum oluşturma, moderasyon kuyruğu
- Canlı ekran modu: statik/periyodik güncellenen 2D scatter plot (Chart.js)
- Sonuç raporu (JSON export + ekran/yazdırma görünümü)

### v1.1 — Bundan Sonra YAPILMAYACAK (yeni ekleme, genişletme durdurulacak)
- Kart destesi (swipe) arayüzü
- D3.js tabanlı canlı akan grafik (mevcut Chart.js/Canvas çözümü korunacak)
- Gelişmiş bot/manipülasyon tespiti (ML tabanlı) — mevcut bot simülatörü sadece
  yük/algoritma testi amaçlı, gerçek kötüye kullanım tespiti değil, bu ayrım korunacak
- Çoklu dil desteği
- Detaylı demografik segmentasyon
- Rol/yetki (RBAC) sistemi — admin/moderatör ayrımı madde 4b'de tanımlanan basit
  modelin ötesine geçmeyecek (ör. "süper admin", "salt-okunur admin" gibi kademeler yok)

> **Not:** Glassmorphism/animasyon ve kişisel konum mini-haritası daha önce bu listede
> "ertelendi" olarak işaretlenmişti, ancak mevcut kod tabanında zaten uygulanmış
> durumda. Bunları geri almak gereksiz kod kaybı olur — mevcut haliyle korunacak,
> ancak üzerine **yeni** görsel karmaşıklık eklenmeyecek.

**Ajan bu listedeki v1.1 maddelerinden herhangi birini "iyi olur" diyerek eklemeye çalışırsa DURMALI ve onay istemelidir.**

## 4. Veri Modeli (Prisma Schema — Final, Değiştirilmeden Kullanılacak)

```prisma
model Admin {
  id           String    @id @default(uuid())
  email        String    @unique
  passwordHash String
  createdAt    DateTime  @default(now())
  sessions     Session[] // oluşturduğu oturumlar
}

enum Visibility {
  PUBLIC
  PASSWORD_PROTECTED
}

model Session {
  id                String        @id @default(uuid())
  code              String        @unique
  title             String
  description       String?
  question          String?       // müzakere edilecek ana soru
  status            String        @default("active") // "active" | "paused"
  isActive          Boolean       @default(true)
  visibility        Visibility    @default(PUBLIC)
  passwordHash      String?       // sadece PASSWORD_PROTECTED için dolu
  passwordUpdatedAt DateTime?     // şifre değişince eski token'ları geçersiz kılmak için
  creatorId         String?       // NULLABLE: admin panelinden değil, herkese açık
                                   // /api/sessions/create ile kurulan oturumlarda boş kalır
                                   // (bkz. madde 4b — moderatör token'ı bu durumda sahiplik kanıtı)
  creator           Admin?        @relation(fields: [creatorId], references: [id])
  analysis          Json?         // son hesaplanan analiz sonucunun cache'i (points, camps, bridges)
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt
  opinions          Opinion[]
  participants      Participant[]
}

model Participant {
  id            String    @id @default(uuid())
  sessionId     String
  session       Session   @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  nickname      String
  justification String?   // katılım gerekçesi, min 15 karakter (Habermas: gerekçelendirme ilkesi)
  isBot         Boolean   @default(false) // bot simülatörüyle oluşturulan sahte katılımcılar
  isBanned      Boolean   @default(false) // soft-ban: yeni oy/görüş engellenir, geçmiş katkılar SİLİNMEZ
  socketId      String?
  createdAt     DateTime  @default(now())
  votes         Vote[]
  opinions      Opinion[]

  @@unique([sessionId, nickname])
}

model Opinion {
  id            String      @id @default(uuid())
  sessionId     String
  session       Session     @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  authorId      String
  author        Participant @relation(fields: [authorId], references: [id], onDelete: Cascade)
  content       String
  status        String      @default("PENDING") // PENDING, APPROVED, REJECTED
  aiWarningFlag Boolean     @default(false) // LLM moderasyon uyarısı koydu mu (madde 15, AI doğruluk takibi için kalıcı iz)
  createdAt     DateTime    @default(now())
  votes         Vote[]
}

model Vote {
  id            String      @id @default(uuid())
  participantId String
  participant   Participant @relation(fields: [participantId], references: [id], onDelete: Cascade)
  opinionId     String
  opinion       Opinion     @relation(fields: [opinionId], references: [id], onDelete: Cascade)
  value         Int         // +1, -1, 0
  createdAt     DateTime    @default(now())

  @@unique([participantId, opinionId])
}
```

Not: Katılımcıya kendi yazdığı görüş oylama kuyruğunda **gösterilmemelidir** (`authorId` filtresiyle).

## 4b. Oturum Oluşturma ve Yetki Modeli (KARAR VERİLDİ — 2 Yollu Model)

**Karar (onaylandı):** Herkes admin olmadan `POST /api/sessions/create` ile serbestçe
oturum kurabilir. Bu, kurumsal olarak bilinçli bir tercihtir — platform kurumun
tek kontrollü aracı değil, Pol.is'e benzer açık bir model olarak konumlanmıştır.
Kurum, kendi resmi istişarelerini admin hesabıyla (`POST /api/sessions`) ayrıca
açabilir; bu iki yol birbirini dışlamaz.

**İki oturum oluşturma yolu:**

| Yol | Endpoint | Kimlik Doğrulama | `creatorId` | Sahiplik Kanıtı |
|---|---|---|---|---|
| Kurumsal (admin) | `POST /api/sessions` | Admin JWT gerekli | Dolu (o admin'in id'si) | Admin JWT |
| Herkese açık | `POST /api/sessions/create` | Gerekmez | `null` | Dönen `moderator` JWT (sessionId'ye özel) |

**Yetki kuralları:**
- **Şifre değiştirme/kaldırma (`PATCH /api/sessions/:code/password`):** SADECE o
  oturumun sahibi çağırabilir — bu, ya (a) `creatorId` ile eşleşen Admin JWT'si ya
  da (b) o `sessionId`'ye özel `moderator` JWT'sidir. **Başka hiçbir admin, başkasının
  kurduğu oturumun şifresini değiştiremez** — bu, kurumun tüm oturumları yönetmesi
  değil, sadece kendi oluşturduklarını yönetmesi anlamına gelir.
- **Devre dışı bırakma (`PATCH /api/sessions/:code/status` — YENİ endpoint, eklenecek):**
  Herhangi bir Admin, kötüye kullanılan/şikayet edilen bir oturumu `status: "paused"`
  yaparak durdurabilir — bu bir **denetim/moderasyon yetkisidir, düzenleme yetkisi
  değildir**. Admin şifreyi göremez/değiştiremez, sadece oturumu kapatabilir.
- Bu ayrım bilinçlidir: "herkes kurabilir" modeliyle "kurum tam kontrol eder" modeli
  birbiriyle çelişir; seçilen çözüm ortada bir denge — kurum kötüye kullanımı
  durdurabilir ama başkasının oturumunu ele geçiremez.

**Yetki kapsamının genişletilmesi (netleştirme — daha önce açık bırakılmıştı):**
Moderasyon (görüş onay/red), kamp yeniden adlandırma, K değeri değiştirme ve
katılımcı kick/ban eylemleri de **sadece oturum sahibi** tarafından yapılabilir
— yani (a) `creatorId` eşleşen Admin, ya da (b) o `sessionId`'ye özel
`moderator` JWT'si. **Başka hiçbir admin bu eylemleri başkasının oturumunda
yapamaz** — sadece madde 4b'deki "durdurma (status: paused)" genel oversight
yetkisi istisnadır, o herhangi bir admin tarafından kullanılabilir. Bu, "admin
sadece kapatabilir, yönetemez" ilkesinin tüm yönetim eylemlerine (sadece şifre
değil) tutarlı şekilde uygulanmasıdır.

**Moderatörün kendi oturumunu durdurması:** Moderatör, kendi oluşturduğu
oturumu da `status: paused` yapabilir (bu, sahiplik kapsamındaki normal bir
yönetim eylemi, ayrıca bir "admin oversight" değil). Yani durdurma eylemi hem
sahip (admin/moderatör) hem de herhangi bir admin (oversight amaçlı)
tarafından yapılabilir — tek eylem, iki farklı yetki gerekçesi.

**Admin hesap yönetimi (değişmedi):**
- Public admin self-registration formu YOK. Admin hesapları sadece seed script
  (`prisma/seed.js`) veya doğrudan veritabanı üzerinden, kurum İT'si tarafından açılır.
- Admin girişi (`POST /api/admin/login`) e-posta + şifre ile, `Admin` tablosuna
  karşı doğrulanır.

**Kötüye kullanım önlemi (YENİ gereksinim — bu karardan doğan zorunlu ek):**
- `POST /api/sessions/create` **kimlik doğrulaması gerektirmediği için** spam/kötüye
  kullanıma açıktır. Bu endpoint'e de `express-rate-limit` uygulanmalıdır (ör. IP
  başına saatte belirli sayıda oturum oluşturma sınırı — kesin sayı Faz 1'de
  netleştirilecek, öneri: saatte 10).
- Bu, madde 1'deki rate-limiting kararının kapsamının genişletilmesidir — sadece
  şifre doğrulama değil, artık oturum oluşturma da sınırlanacak.

## 5. Köprü Cümle (Bridge Opinion) Kuralı — Kesin Formül

Bir görüş "köprü cümle" sayılır **ancak ve ancak**:
- Her kümede "Katılıyorum" oranı > %60 **VE**
- O görüşe oy veren toplam katılımcı sayısı ≥ oturumdaki toplam katılımcının %30'u

İkinci şart olmadan uygulanmayacak — az sayıda oyla yanıltıcı "konsensüs" iddiası oluşmasını önlemek için zorunludur.

## 6. Otonomi ve Onay Kuralları (Ajan İçin)

- Veri modeli, mimari, kütüphane seçimi içeren her görev **Plan Mode** ile yapılacak — önce plan sunulacak, onay sonrası uygulanacak.
- Küçük, izole düzeltmeler (tek bileşen stil düzeltmesi vb.) **Fast Mode** ile yapılabilir.
- Bu dosyadaki "Kesinlikle Kullanılmayacak" veya "v1.1" listesindeki bir öğeye değinen her öneri, uygulanmadan önce insana sorulmalıdır.
- `git commit` atmadan önce diff insan tarafından gözden geçirilecektir; ajan otomatik commit atmayacaktır.

## 7. Test Beklentileri

- Yük testi: k6, 200 sanal katılımcı simülasyonu
- Birim testi: vitest, PCA/KMeans fonksiyonları mock veriyle doğrulanacak

## 8. Üretim/Pilot Öncesi Güvenlik Sertleştirme (Kesin Gereksinimler)

Mevcut kod tabanı geliştirme için uygun varsayılanlar içeriyor; pilot/gerçek
kullanım öncesi aşağıdakiler **zorunlu**:

- `JWT_SECRET` için kod içi varsayılan (`kamusal_alan_gizli_anahtar` gibi) KALDIRILACAK.
  `.env`'de tanımlı değilse sunucu **başlamayı reddetmeli**, sessizce zayıf bir
  sırra düşmemeli.
- `NODE_ENV=production` iken `DATABASE_URL` tanımsızsa sunucu in-memory moda
  **sessizce geçmemeli**, hata verip kapanmalı — aksi halde pilot sırasında veri
  kaybı riski sessizce oluşur.
- Admin seed'inde sabit şifre (`admin123` gibi) kullanılmayacak; ilk kurulumda
  rastgele üretilip tek seferlik konsola yazdırılacak ya da ilk girişte zorunlu
  şifre değiştirme akışı olacak.
- CORS, geliştirmede "tüm kaynaklara açık" kalabilir ama pilot/üretim ortamında
  belirli origin'lere kısıtlanacak.
- `docker-compose.yml`'deki Postgres şifresi, pilot öncesi `.env`'den okunan
  gerçek bir değerle değiştirilecek (repo'daki varsayılan sadece yerel geliştirme içindir).

## 10. Socket.io Güvenlik ve Veri Bütünlüğü Kararları (Aşama 8-9 Sonrası)

- **Her ayrıcalıklı socket olayında** (`admin-rename-camp`, `admin-update-camps-count`,
  kick/ban, `admin-approve-statement` vb.) token, **sadece bağlantı kurulduğunda değil,
  her emit alındığında** yeniden doğrulanmalı — bağlantı süresince şifre değişmiş/yetki
  iptal edilmiş olabilir, canlı socket bağlantısı bu durumu otomatik yansıtmaz.
- **Katılımcı çıkarma (kick/ban) HARD DELETE yapmaz.** `Participant.isBanned = true`
  olarak işaretlenir. Kişinin PENDING (henüz onaylanmamış) görüşleri temizlenebilir,
  ama APPROVED görüşleri ve o görüşlere verilmiş başka katılımcıların oyları
  KORUNUR — cascade silme burada bilinçli olarak devre dışı bırakılır.
- **Kamp merkezi eşleştirme (centroid tracking):** Her yeni PCA/KMeans turunda,
  yeni merkezler bir önceki turun merkezleriyle (öklid mesafesi en yakın olan)
  eşleştirilmeli, böylece `admin-rename-camp` ile verilen isimler kümeler arası
  karışsa bile doğru gruba yapışmaya devam eder.

## 11. Analiz Güvenilirliği Kararları (Öncelik 1-3)

- **Eksik oy işleme:** Bir katılımcının oy vermediği görüş, matriste `0` (nötr oy)
  ile KARIŞTIRILMAMALI. Eksik hücreler `null`/`NaN` olarak işaretlenip, PCA
  hesaplarında (kovaryans/iç çarpım) sadece iki değişkeni de gerçekten oylamış
  katılımcılar üzerinden hesap yapılmalı (NIPALS'ın eksik veriyle çalışabilme
  özelliği bu amaçla zaten var, implementasyon bunu doğru kullanmalı).
- **Minimum örneklem eşiği (analiz motorunun kendisi için, köprü cümleden ayrı):**
  Analiz (kümeleme + kutuplaşma yüzdesi) yalnızca en az **10 katılımcı VE en az
  5 onaylanmış görüş** varsa çalışır. Bu eşiğin altında sistem "Anlamlı analiz
  için daha fazla katılım gerekli" mesajı göstermeli, sahte/erken kümeleme
  sonucu üretmemeli.
- **Varyans açıklama oranı:** `calculatePCA` çıktısına `varianceExplained`
  (ör. `[0.42, 0.18]`) eklenmeli. Toplam açıklanan varyans %40'ın altındaysa,
  arayüzde haritanın yanında bir uyarı gösterilmeli.
- **Küme kararlılığı:** Her analiz turunda K-Means 5-10 kez (farklı rastgele
  başlangıçla) çalıştırılıp en iyi sonuç seçilmeli; katılımcıların çalıştırmalar
  arasında aynı gruba düşme oranı bir "kararlılık skoru" olarak hesaplanıp
  rapora eklenmeli.

## 12. Test/Doğrulama Amaçlı Tek Seferlik Araçlar (İstisna)

- `scripts/import-polis-dataset.js` — Pol.is açık veri setini (CSV) mevcut
  şemaya aktarıp algoritma doğrulaması yapmak için tek seferlik bir araçtır.
  Bunun için `csv-parse` paketi **devDependency** olarak eklenmesi onaylıdır —
  bu, madde 1'deki "onaysız yeni bağımlılık yok" kuralına bir istisnadır çünkü
  (a) sadece geliştirme/test amaçlı, üretim runtime'ına dahil değil,
  (b) tek seferlik veri aktarımı için, kalıcı bir mimari parça değil.
- Bu script'in oluşturduğu oturum `PASSWORD_PROTECTED` olmalı ve genel
  kullanıcılara paylaşılmamalı — sadece algoritma/rapor doğrulama amaçlı,
  gerçek istişare verisiyle karışmaması için.

## 13. Yük Testi — İki Ayrı Test, Birbirinin Yerine Geçmez

- **Algoritma/ölçek testi (mevcut, bot simülatörü):** Admin panelindeki
  +100/+200/+500 bot simülasyonu, PCA/KMeans'in büyük veri setinde doğru
  çalıştığını test eder — ama tek process içinde çalıştığı için gerçek
  WebSocket eşzamanlılığını YANSITMAZ.
- **Gerçek eşzamanlılık testi (ayrı, dışarıdan yapılacak):** k6/artillery ile,
  gerçek ağ üzerinden 200 eşzamanlı WebSocket bağlantısı simüle edilecek —
  bu, sunucunun gerçek yük altında (event loop, bağlantı yönetimi) nasıl
  davrandığını gösterir. Bot simülatörü bunun yerine geçmez, ikisi de yapılmalı.

## 14. Kutuplaşma Derecesi (Polarisability) Formülü — KARAR VERİLDİ

**Eski formül (KALDIRILDI):**
```
Polarisability = min(OrtalamaKampMerkeziMesafesi / 160 * 100, 100)
```
Bu formül üç doğrulanmış sorun içeriyordu: (a) K=1 durumunda merkez çifti
olmadığından 0/0 → NaN riski, (b) sabit bölen (160) keyfi ve gerçek maksimum
mesafeden (köşegen, ~226.3) küçük olduğu için erken %100 doygunluğu, (c) kamp
büyüklüğünü hiç ağırlıklandırmadığı için 3 kişilik bir uç grup ile 277 kişilik
ana kütlenin etkisini eşitliyordu, (d) K değerine ve merkezlerin geometrik
dizilimine duyarlı, tutarsız sonuç üretebiliyordu.

**Yeni formül (Between-SS / Total-SS, ANOVA mantığı):**
```
Polarisability = (KamplarArasıVaryans / ToplamVaryans) * 100

KamplarArasıVaryans = Σ_k [ n_k * ||merkez_k - genelMerkez||² ]
ToplamVaryans        = Σ_i [ ||nokta_i - genelMerkez||² ]
```
- `n_k` = k. kampın katılımcı sayısı (kamp büyüklüğü otomatik ağırlıklandırılır)
- `genelMerkez` = tüm katılımcıların 2D koordinatlarının ortalaması
- Doğal olarak [0, 100] aralığında, `min()` ile kırpmaya gerek yok
- K'ye ve merkezlerin geometrik dizilimine karşı matematiksel olarak daha
  tutarlı (varyans ayrıştırması, çift-mesafe ortalamasından farklı olarak
  dizilime duyarlı değildir)

**Zorunlu koruma (guard clause):** `ToplamVaryans === 0` ise (K=1 veya tüm
katılımcılar aynı noktadaysa) sonuç `NaN` DÖNMEMELİ — bu durumda
`polarisability: null` ve `insufficientVariance: true` gibi açık bir durum
döndürülmeli, frontend bunu "Kutuplaşma hesaplanamadı (tek grup)" şeklinde
göstermeli.

**Varyans güvenilirliği ile bağlantı:** `varianceExplained` toplamı düşükse
(madde 11'deki %40 eşiğinin altındaysa), kutuplaşma yüzdesinin yanında
"Bu oran sınırlı bir varyansa (%X) dayanıyor, temkinli yorumlayın" uyarısı
gösterilmeli — iki metrik ayrı hesaplanır ama birlikte sunulmalı.

## 15. Genişletilmiş Analiz Özellikleri (A1, A2, A3, B4, B5, E9, F10) — Kesin Kararlar

Bu yedi özellik ayrı, bağımsız görevler olarak ele alınmalı — her biri kendi
planı ve onayıyla, birbirine karışmadan uygulanmalı.

### A1 — PCA Eksen Yorumlanabilirliği (Loading Analizi)
- Her bileşen (X, Y) için, o bileşene en yüksek mutlak katkıyı yapan (en
  büyük |loading| değerine sahip) ilk 3 görüş belirlenir.
- Bu görüşler LLM'e verilip "Bu eksen hangi ayrım etrafında şekilleniyor?"
  sorusuyla kısa bir Türkçe etiket üretilir (mevcut küme özeti mekanizmasıyla
  aynı LLM çağrı deseni kullanılır, yeni bir entegrasyon yolu icat edilmez).
- Ek npm paketi gerekmez, NIPALS zaten loading vektörlerini üretiyor.

### A2 — Alt Küme (Recursive Sub-clustering) Analizi
- Sadece şu koşulu sağlayan kamplar için uygulanır: kamp büyüklüğü ≥ toplam
  katılımcının **%40'ı VE** ≥ **20 katılımcı**. Küçük kamplara uygulanmaz.
- Alt kümeleme **tek seviye derinlikte** yapılır (alt kümenin alt kümesi
  ARANMAZ) ve sabit **K=2** ile çalıştırılır — otomatik K seçimi bu görevin
  kapsamında değil.
- Sonuç ayrı bir `subClusters` alanı olarak rapora eklenir, ana kümeleme
  sonucunu (camps) DEĞİŞTİRMEZ, ek bir bilgi katmanıdır.

### A3 — Aykırı Değer (Outlier/Ambiguous) Tespiti
- Bir katılımcı "belirsiz/aykırı" sayılır eğer: en yakın iki merkeze olan
  mesafe oranı (2. en yakın mesafe / 1. en yakın mesafe) **1.2'den küçükse**
  (yani iki kampa neredeyse eşit uzaklıktaysa). Mutlak mesafe eşiği KULLANMA
  — göreli oran kullan, bu farklı ölçekteki oturumlarda daha tutarlı çalışır.
- Bu katılımcılar KMeans sonucunda zorla bir kampa atanmaya devam eder
  (algoritma bunu gerektirir) ama ayrıca `ambiguous: true` bayrağıyla
  işaretlenir, raporda "net bir kampa dahil olmayan X katılımcı" olarak
  ayrı gösterilir.

### B4 — Katılım Eşitliği (Gini Katsayısı)
- Hesaplama SADECE onaylanmış (`APPROVED`) görüşler üzerinden yapılır, bot
  katılımcılar (`isBot: true`) hariç tutulur.
- Standart Gini katsayısı formülü kullanılır (kişi başına yazılan onaylı
  görüş sayısı dağılımı üzerinden). Ek kütüphane GEREKMEZ, birkaç satır JS
  ile hesaplanır.
- Rapora `participationGini: 0.62` gibi bir değer eklenir; yüksek değer
  (>0.6) "görüş üretimi az sayıda kişide yoğunlaşmış" anlamına gelir ve
  raporda bir not olarak belirtilir.

### B5 — Oy Tamamlama Oranı
- Formül: `toplamOyKayitSayisi / (katilimciSayisi * onayliGorusSayisi) * 100`
- Bot katılımcılar ve onaylanmamış görüşler hesaba katılmaz.
- Bu oran düşükse (<%20), madde 11'deki minimum örneklem eşiğiyle birlikte
  yorumlanmalı — düşük tamamlama oranı, eksik oy sorununu (madde 11)
  büyütücü bir etken olarak raporda belirtilmeli.

### E9 — AI Moderasyon Doğruluğu İzleme
- Şemaya `Opinion.aiWarningFlag` (Boolean, `@default(false)`) eklenir —
  görüş gönderildiği ANDA LLM'in `evaluateOpinionContent` sonucu buraya
  yazılır, moderatörün sonraki kararından (`status`) BAĞIMSIZ olarak saklanır.
- Metrik: flagged görüşlerin ne kadarı sonradan `REJECTED` oldu (doğru
  alarm), ne kadarı `APPROVED` oldu (yanlış alarm/false positive). Bu oran
  admin panelinde zaman içinde takip edilebilir bir gösterge olarak sunulur.
- Flagged OLMAYIP sonradan reddedilen görüşler (false negative) bu metrikte
  ayrı izlenmez — bu, ek bir moderatör-gerekçe alanı gerektirir, kapsam dışı.

### F10 — Oturumlar Arası Meta-Analiz
- **KRİTİK KAPSAM KARARI:** Bu analiz SADECE `creatorId` dolu olan (yani
  kurumun admin hesabıyla resmi olarak oluşturduğu) oturumları kapsar.
  Madde 4b'deki herkese açık (`creatorId: null`, moderatör tarafından
  kurulan) oturumlar bu meta-analize DAHİL EDİLMEZ — çünkü bunlar kurumun
  resmi istişare programının bir parçası değil, bağımsız/denetimsiz
  oturumlar; bunları kurumsal istatistiklere karıştırmak yanıltıcı olur.
- Yeni endpoint: `GET /api/admin/sessions-overview` (admin JWT gerektirir).
  Sadece talep eden admin'in kendi oluşturduğu oturumları listeler (owner
  kısıtı madde 4b ile tutarlı) — başka bir adminin oturumlarını göstermez.
- Rapor: oturum başına kutuplaşma derecesi, köprü cümle sayısı, katılımcı
  sayısı — basit bir tablo/liste, karmaşık bir cross-session dashboard
  görselleştirmesi bu görevin kapsamında DEĞİL (v1.1'e bırakılabilir).

## 16. UI/UX ve Gizlilik Düzeltmeleri (Kullanıcı Talebiyle)

- **Katılım gerekçesi (justification) alanı KALDIRILDI:** `Participant.justification`
  alanı şemada `nullable` olarak kalır (veri kaybı olmasın diye, geçmiş veri
  bozulmasın), ama giriş ekranında artık İSTENMEZ/GÖSTERİLMEZ. Bu, projenin
  Habermas temelindeki "gerekçelendirme" ilkesinin UI karşılığının bilinçli
  olarak kaldırılmasıdır — geri dönülebilir bir karar, alan silinmedi.
- **Görüş karakter sınırı: 750** (eski: 140-280). Bkz. madde 3.
- **Oylama ekranında yazar adı GİZLENİR:** Görüş oylanırken, o görüşü kimin
  yazdığı katılımcıya gösterilmez (anonim oylama). `authorId` veritabanında
  kalır (kendi görüşünü oylamama filtresi, raporlama için), sadece UI'da
  gösterilmez.
- **Varsayılan/örnek görüşler KALDIRILIR:** Yeni oturum oluşturulduğunda
  otomatik eklenen örnek görüşler (mevcut kodda ~8 adet) tamamen kaldırılır
  — yeni oturum sıfır görüşle başlar, katılımcılar kendi görüşlerini
  sıfırdan girer.
- **Şifreli oturumun konusu, şifre girilmeden GÖRÜNMEZ (güvenlik düzeltmesi):**
  Giriş ekranındaki "aktif tartışma sorusu" alanı, `PASSWORD_PROTECTED`
  oturumlar için şifre doğrulanmadan ASLA sunucudan client'a gönderilmemeli
  — bu sadece bir UI gizleme değil, backend'in bu bilgiyi doğrulanmamış
  isteklere hiç döndürmemesi gerekiyor (aksi halde frontend kodu incelenerek
  bypass edilebilir).
- **Canlı ekran, sadece katılınan oturum bağlamında erişilebilir:** Hiçbir
  oturuma giriş yapılmamışken canlı ekran paneli gösterilmez/erişilemez.
  Bu, mevcut oturum erişim kontrolü (madde 4b) mantığının canlı ekran
  rotasına da uygulanmasıdır — ayrı bir yeni mekanizma değil.
- **Oturum içindeki katılımcı, admin paneline erişemez/yönlendirilmez:** Bu
  bir UI/routing temizliği — backend zaten admin JWT'siz istekleri
  reddediyor (mevcut koruma), bu madde sadece arayüzde gereksiz/karıştırıcı
  bir geçiş yolunun kaldırılmasıdır.
- **"Oturumu sıfırla" düzeltmesi:** Mevcut sıfırlama eylemi çalışmıyor (bug,
  önce teşhis edilmeli). Düzeltme sonrası, sıfırlanan bir oturum artık
  admin panelindeki oturum seçim listesinde GÖRÜNMEMELİ/SEÇİLEMEMELİ —
  yani sıfırlama, oturumu sadece "veri temizleme" değil, aynı zamanda
  "listeden çıkarma/arşivleme" anlamına gelir (ör. `status: 'archived'`
  gibi bir durum, `isActive: false`). Bu, veri BÜTÜNLÜĞÜNÜ bozacak şekilde
  (cascade hard-delete ile) YAPILMAMALI — madde 10'daki soft-ban mantığıyla
  tutarlı olarak, kayıtlar silinmek yerine durum değiştirilerek gizlenmelidir.

## 17. Koyu/Açık Tema Entegrasyon Düzeltmesi, Kutuplaşma Etki Analizi, Uzlaşı Keşif Paneli

- **Koyu tema bug'ı:** Form `input`/`textarea` elemanları ve liste satırları
  (katılımcı yönetimi listesi gibi) tema değişkenlerini (CSS custom
  properties, madde 1 tasarım sistemi) KULLANMIYOR, sabit açık renk kalmış.
  Düzeltme: TÜM form elemanları ve liste satırları `--bg-card`/`--bg-main`
  gibi mevcut tema değişkenlerinden renk almalı, sabit `background: white`
  veya tarayıcı varsayılanı KALMAMALI. Ayrıca ekranlarda tema ile
  bütünleşmemiş, açıkta kalan herhangi bir widget/buton (ör. sağ alt
  köşedeki kimliği belirsiz kutucuk) tespit edilip ya kaldırılmalı ya da
  tema değişkenleriyle uyumlu hale getirilmeli.

- **Görüşün kutuplaşma derecesine etkisi (rapor bölümü):** Hesaplama
  YÖNTEMİ istatistiksel olmalı — "leave-one-out" (bırak-birini-dışarıda):
  her onaylı görüşü ve ona ait oyları matristen çıkarıp madde 14'teki
  kutuplaşma formülünü yeniden hesapla, skorun ne kadar değiştiğini bul.
  Bu hesaplama SADECE rapor oluşturulurken (canlı analizde değil, tek
  seferlik) yapılır — performans nedeniyle. LLM SADECE bu istatistiksel
  sonucu nötr bir dille anlatan bir cümle üretmek için opsiyonel olarak
  kullanılabilir (ör. "Bu görüş çıkarıldığında kutuplaşma X puan
  değişiyor") — LLM'in kendisi hangi görüşün etkili olduğuna KARAR
  VERMEZ, sadece zaten hesaplanmış sayıyı anlatır. Yazar bilgisi ASLA
  gösterilmez. "Sorunlu/kutuplaştırıcı" gibi damgalayıcı dil KULLANILMAZ,
  nötr çerçeveleme zorunludur (madde 15/16'daki nötr dil ilkesiyle tutarlı).

- **Uzlaşı Potansiyeli Keşif Paneli:** SADECE admin/moderatör panelinde,
  canlı oturum bağlamında bulunur — rapora DAHİL EDİLMEZ (ayrı bir karar
  gerekmedikçe). Moderatörün talebi üzerine (bir buton ile) tetiklenir,
  periyodik/otomatik ÇALIŞMAZ. Çıktı her zaman "AI Tahmini" etiketiyle
  gösterilir, asla bir görüş/köprü cümle olarak sisteme enjekte edilmez.
  Sadece onaylı (`APPROVED`) görüşlerin temalarına dayanır, katılımcı
  ekranında hiç gösterilmez.

## 18. LLM Çağrı Hacmi Kontrolü — Önbellekleme ve Dry-Run Testi

- **Önbellekleme (zorunlu düzeltme):** Küme özeti ve eksen etiketleme
  çağrıları, her debounce döngüsünde KOŞULSUZ tekrar yapılmamalı. Her kamp
  için, en yüksek contrastScore'a sahip ilk 3 görüşün ID'lerinden bir imza
  (ör. sıralı ID'leri birleştirip oluşturulan bir string/hash) çıkarılır.
  Bu imza bir önceki döngüyle AYNIYSA, LLM'e tekrar sorulmaz, önbellekteki
  (cache'lenmiş) önceki metin kullanılır. Sadece imza değiştiğinde
  (kampın karakteristik görüşleri gerçekten değiştiğinde) yeni çağrı yapılır.
- **Dry-run modu:** `.env`'de `LLM_DRY_RUN=true` ayarlandığında, `llm.service.js`
  gerçek API'ye HİÇ istek atmaz — sadece her çağrıyı (tipi ve zaman damgasıyla:
  `cluster-summary`, `moderation`, `axis-label`, `polarization-impact`,
  `consensus-discovery`) bir log dosyasına/tabloya kaydedip sabit bir örnek
  metin döndürür. Bu, gerçek kurum API'sine hiç dokunmadan hacim testi
  yapılmasını sağlar.
- **Hacim testi metodolojisi:** Mevcut bot simülatörü (+500 özelliği) dry-run
  modunda 10-15 dakika çalıştırılır, log'dan toplam ve tip-bazlı çağrı sayısı
  çıkarılıp kurumun kotasıyla karşılaştırılır. Bu, önceki manuel/tahmini
  kota konuşmasının yerine somut bir sayıyla gelir.
