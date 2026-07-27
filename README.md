# ⚖️ Müzakere Masası — Kamusal Alan & Uzlaşı Platformu

> **Habermas'ın İdeal Konuşma Durumu teorisine dayalı, gerçek zamanlı fikir kümeleme, çoklu dil desteği, gelişmiş moderasyon ve uzlaşı tespit platformu.**

Müzakere Masası, sosyal medyanın kutuplaştırıcı yapısına karşı geliştirilen bir dijital müzakere aracıdır. Katılımcıların görüşlerini toplar, matematiksel algoritmalarla (PCA + K-Means) fikir gruplarını haritalandırır, tüm tarafların ortaklaşa desteklediği **Köprü Cümleleri** otomatik olarak tespit eder ve kutuplaşma trendini zaman içinde görselleştirir.

---

## 📑 İçindekiler

- [Kuramsal Temel](#-kuramsal-temel)
- [Yeni Eklenen Özellikler (Aşama 5 - 9)](#-yeni-eklenen-özellikler-aşama-5---9)
- [Teknoloji Yığını](#-teknoloji-yığını)
- [Proje Mimarisi](#-proje-mimarisi)
  - [Dizin Yapısı](#dizin-yapısı)
  - [Veri Akışı](#veri-akışı)
- [Kurulum & Çalıştırma](#-kurulum--çalıştırma)
- [Ortam Değişkenleri](#-ortam-değişkenleri)
- [Kullanım Kılavuzu](#-kullanım-kılavuzu)
  - [Yönetici Paneli](#yönetici-paneli)
  - [Katılımcı ve Görüş Havuzu](#katılımcı-ve-görüş-havuzu)
  - [Çoklu Dil Yönetimi](#çoklu-dil-yönetimi)
- [API ve Soket Referansı](#-api-ve-soket-referansı)
- [Algoritmalar](#-algoritmalar)
  - [Temel Bileşenler Analizi (PCA)](#1-pca---temel-bileşenler-analizi)
  - [Dinamik K-Means Kümeleme](#2-dinamik-k-means-kümeleme)
  - [Kutuplaşma Derecesi Trendi](#3-kutuplaşma-derecesi-trendi)
- [Test & Doğrulama](#-test--doğrulama)
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
| **Gerekçelendirme** | Fikir havuzunda rasyonel gerekçelendirme ve müzakere olanağı |
| **Samimiyet** | Anonim ve baskısız oy kullanma ortamı |
| **Evrensel Erişim** | Herkese açık (PUBLIC) veya şifre korumalı katılım |

---

## ✨ Yeni Eklenen Özellikler (Aşama 5 - 9)

Müzakere Masası platformunun son aşamalarında aşağıdaki kurumsal analitik, güvenlik ve arayüz özellikleri entegre edilmiştir:

1. 👤 **Anonim Oylama Yapısı:** Katılımcıların oy verirken önyargıdan uzak durabilmeleri için oylama kartlarından yazar rumuzları kaldırılmış, tam anonimlik sağlanmıştır.
2. ✍️ **750 Karakter Görüş Sınırı:** Katılımcıların fikirlerini daha detaylı ifade edebilmeleri amacıyla görüş ekleme limiti 750 karaktere çıkartılmıştır.
3. 🗺️ **Dinamik Fikir Haritası Tooltip'leri:** 2D Scatter Plot haritası üzerindeki katılımcı noktalarına gelindiğinde nickname ve bot/gerçek durumu tooltip ile yansıtılır.
4. 🛡️ **Gelişmiş Moderasyon & Katılımcı Engelleme (Ban/Kick):** Yöneticiler sabote edici kullanıcıları masadan atabilir. Atılan kullanıcının oyları anında analiz matrisinden düşürülür.
5. 🌉 **Görüş Havuzu (Opinion Pool):** Katılımcılar approved olmuş tüm görüşler arasından kelime bazlı arama yapabilir, kamplara veya uzlaşılan köprülere göre süzebilir ve oylarını anında havuz üzerinden güncelleyebilirler.
6. 🗳️ **Offline Oylama & Arka Plan Sync:** İnternet koptuğunda katılımcının oyları yerelde sıraya alınır ve bağlantı geri geldiğinde sunucuya otomatik aktarılır.
7. 🏛️ **Kurumsal e-Devlet Teması:** Arayüz, cam/mor parlak karanlık temadan tamamen arındırılarak kamu kurumlarına uygun güven verici lacivert (`#0c2340`), koyu mavi, beyaz ve açık gri hafif kurumsal bir tasarıma kavuşturulmuştur.
8. 🔒 **Güçlendirilmiş Şifre Güvenliği:** Şifre korumalı oturumların konusu (deliberation topic) ve görüş listesi, şifre doğrulanana kadar ziyaretçilerden gizlenir.
9. 🗺️ **Sınırlı Canlı Ekran Erişimi:** Canlı ekran `/live` ve `/live/:code` rotalarına sadece o oturuma dahil olmuş kullanıcıların ve yöneticilerin erişebilmesi sağlanmış, aktif ekran değişimleriyle tarayıcı URL'si dinamik senkronize edilmiştir.
10. ♻️ **Güvenli Oturum Arşivleme & Sıfırlama:** "Oturumu Sıfırla" metodu veritabanındaki eski analizleri ve görüşleri kalıcı olarak temizler. Sıfırlanan oturum `status: 'archived'` olarak işaretlenerek admin seçim listelerinden kaldırılır ve bu kodla tekrar katılım engellenir.

---

## 🛠 Teknoloji Yığını

| Katman | Teknoloji | Açıklama |
|--------|-----------|----------|
| **Frontend** | React 18 + Vite 5 | SPA mimarisi, JSX bileşenleri |
| **Stil** | Vanilla CSS | Glassmorphism, CSS değişkenleri, responsive grid |
| **Diller** | JS (ES6+) + CSS | Çoklu dil (i18n) sözlük altyapısı |
| **İkonlar** | Lucide React | SVG tabanlı ikonlar |
| **Backend** | Express 4 + Node.js | REST API sunucusu |
| **Gerçek Zamanlı** | Socket.io 4 | Çift yönlü WebSocket iletişimi |
| **Veritabanı** | PostgreSQL 16 + Prisma 5 | İlişkisel veri modeli (veya RAM yedek modu) |
| **Kimlik Doğrulama** | JWT + Bcrypt | Token tabanlı şifreli doğrulama |
| **Test** | Vitest | Algoritmalar için birim testleri |

---

## 🏗 Proje Mimarisi

### Dizin Yapısı

```
müzakere-masası/
├── index.html                  # Giriş HTML belgesi
├── package.json                # Bağımlılıklar ve script'ler
├── vite.config.js              # Vite proxy yapılandırması
├── docker-compose.yml          # PostgreSQL konteyner tanımı
├── run.ps1                     # Windows başlatma scripti
│
├── prisma/
│   ├── schema.prisma           # targetK, customCampNames ve polarizationHistory eklenmiş şema
│   └── seed.js                 # Master admin seed verisi
│
├── server/
│   ├── index.js                # Express sunucusu ve soket olayları
│   ├── database.js             # Veritabanı ve in-memory cache metotları
│   ├── algorithms.js           # PCA, K-Means ve köprü analizi motoru
│   └── tests/                  # Birim testleri
│
└── src/
    ├── main.jsx                # React giriş noktası
    ├── App.jsx                 # Dil seçimi ve ana yönlendirici state
    ├── i18n.js                 # TR/EN çeviri sözlüğü ve t() yardımcısı
    ├── App.css                 # Kurumsal global stil şablonu (e-Devlet teması)
    └── components/
        ├── Lobby.jsx           # Giriş ekranı (masa kodu, rumuz, oturum tipi)
        ├── Participant.jsx     # Oylama, harita, Görüş Havuzu ve moderasyon
        ├── AdminDashboard.jsx  # Yönetici paneli, K seçimi, yeniden adlandırma
        ├── LiveScreen.jsx      # Canlı projeksiyon ekranı (oturum bağlamı kontrollü)
        └── ReportView.jsx      # Sonuç raporu, SVG trend grafiği
```

### Veri Akışı

```
Katılımcı Oyu / Güncellemesi
      │
      ▼
  Socket.io "submit-vote"
      │
      ▼
  database.js: castVote() ──► In-Memory Map + Prisma DB
      │
      ▼
  runAndBroadcastAnalysis() (1.5s debounce)
      │
      ├──► calculatePCA()                  → 2D koordinatlar
      ├──► calculateKMeans() (targetK ile)  → Dinamik kamp grupları
      ├──► analyzeCampsAndBridges()        → Köprü & Kamp verileri
      ├──► addPolarizationHistoryEntry()   → Zaman serisi geçmişi kaydı
      └──► Custom Name Mapping             → Özel isim eşleşmeleri
            │
            ▼
      Socket.io "analysis-update" → Tüm bağlı istemcilere yayın
```

---

## 🚀 Kurulum & Çalıştırma

### Hızlı Başlangıç (In-Memory Mod)

PostgreSQL veya Docker gerektirmeden bellek içi modda çalıştırma:

```bash
# 1. Bağımlılıkları yükle
npm install

# 2. Geliştirme sunucularını başlat (Frontend + Backend paralel)
npm run dev
```

Vite sunucusu `http://localhost:5173` adresinde, backend ise `http://localhost:3001` adresinde çalışacaktır. Veritabanı bulunamadığında in-memory mod otomatik olarak aktifleşir.

---

## 📖 Kullanım Kılavuzu

### Yönetici Paneli

**Giriş Bilgileri:**
* **E-posta:** `admin@muzakere.local`
* **Şifre:** `admin123`

1. Sağ üst köşedeki **"Yönetici Paneli"** butonuna tıklayın ve şifreyi girin.
2. Açılan panelde:
   - **Hedef Kamp Sayısı:** Fikir kamplarının sayısını `2` ile `5` arasında dinamik ayarlayabilirsiniz.
   - **Kampları Yeniden Adlandır:** Oluşan kampların yanındaki "Düzenle" butonuna basarak özel isimler atayabilirsiniz.
   - **Bot Simülatörü:** +100 veya +200 bot ekleyerek anlık küme dağılımını test edebilirsiniz.

### Katılımcı ve Görüş Havuzu
* Katılımcı ekranında oylama panelinin altında approved olan tüm müzakere görüşleri listelenir.
* Arama çubuğu ile belirli bir kelimeyi arayabilir ya da dropdown üzerinden kamplara göre filtre uygulayabilirsiniz.
* Havuzdaki oylama butonlarıyla oylarınızı anlık güncelleyebilirsiniz.

### Çoklu Dil Yönetimi
* Uygulamanın en üst kısmında yer alan `TR` ve `EN` butonları ile tüm platform dilini Türkçe veya İngilizceye dönüştürebilirsiniz.

---

## 📡 API ve Soket Referansı

### Yeni Soket Olayları (Emit)
* `admin-update-camps-count` `{ sessionCode, targetK }`: Hedef küme sayısını değiştirir.
* `admin-rename-camp` `{ sessionCode, campId, newName }`: Belirli bir kampı isimlendirir.

---

## 🧮 Algoritmalar

### 1. PCA — Temel Bileşenler Analizi
NIPALS iteratif algoritması kullanılarak katılımcı oy matrisi (`1`, `-1`, `0` değerleri içeren) 2 boyuta indirgenir ve koordinatlar `[-80, 80]` aralığına normalize edilir.

### 2. Dinamik K-Means Kümeleme
PCA skor koordinatları K-Means algoritması ile kümelenir. `targetK` değeri yönetici panelinden dinamik olarak okunduğundan, K-Means centroidleri ve atamaları seçilen K değerine göre anlık olarak güncellenir.

### 3. Kutuplaşma Derecesi Trendi
Her analiz aşamasında kutuplaşma derecesi (`polarisability` %) hesaplanır ve `addPolarizationHistoryEntry` metodu ile zaman serisi olarak saklanır. Bu veri `ReportView.jsx` içerisindeki SVG grafik motorunda çizgisel değişim grafiğine dönüştürülür.

---

## 🧪 Test & Doğrulama

Birim testlerini çalıştırmak için:
```bash
npm run test
```
Bu testler PCA boyutsallık indirgeme doğruluğunu, K-Means yakınsamasını ve Köprü Cümle formüllerinin matematiksel doğruluğunu test eder.

---

## 📄 Lisans

Bu proje eğitim ve araştırma amaçlı açık kaynaklı bir platformdur.
