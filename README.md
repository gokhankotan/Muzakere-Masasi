# ⚖️ Müzakere Masası — Kamusal Alan & Uzlaşı Platformu

> **Habermas'ın İdeal Konuşma Durumu teorisine dayalı, gerçek zamanlı fikir kümeleme, çoklu dil desteği, gelişmiş moderasyon ve uzlaşı tespit platformu.**

Müzakere Masası, sosyal medyanın kutuplaştırıcı yapısına karşı geliştirilen bir dijital müzakere aracıdır. Katılımcıların görüşlerini toplar, matematiksel algoritmalarla (PCA + K-Means) fikir gruplarını haritalandırır, tüm tarafların ortaklaşa desteklediği **Köprü Cümleleri** otomatik olarak tespit eder ve kutuplaşma trendini zaman içinde görselleştirir.

---

## 📑 İçindekiler

- [Kuramsal Temel](#-kuramsal-temel)
- [Yeni Eklenen Özellikler & Güncellemeler](#-yeni-eklenen-özellikler--güncellemeler)
- [CompDemocracy OpenData Oturumları](#-compdemocracy-opendata-oturumları)
- [Teknoloji Yığını](#-teknoloji-yığını)
- [Proje Mimarisi](#-proje-mimarisi)
  - [Dizin Yapısı](#dizin-yapısı)
  - [Veri Akışı](#veri-akışı)
- [Kurulum & Çalıştırma](#-kurulum--çalıştırma)
- [Ortam Değişkenleri](#-ortam-değişkenleri)
- [Kullanım Kılavuzu](#-kullanım-kılavuzu)
- [API ve Soket Referansı](#-api-ve-soket-referansı)
- [Algoritmalar & Dinamik Uzlaşı Motoru](#-algoritmalar--dinamik-uzlaşı-motoru)
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

## ✨ Yeni Eklenen Özellikler & Güncellemeler

1. 🏛️ **Swiss Bento Grid & Çift UI Tasarım Altyapısı:** Swiss International tipografi disiplini (Inter/Outfit), rasyonel asimetrik grid düzeni ve `✨ UI: Swiss Bento` / `🏛️ UI: Klasik` anlık geçiş butonu (`muzakere_ui_mode`).
2. ⚡ **Neo-Brutalist Köprü Görüş Vurgusu:** Uzlaşı cümleleri için 2.5px solid border, `#2563EB` mavi sol şerit ve `⚡ KÖPRÜ GÖRÜŞ (ORTAK MUTABAKAT)` rozetli özel kart tasarımı (`.bridge-accent-card`).
3. 📐 **3-Sütunlu Matematiksel Header Mimarisi:** `grid-template-columns: 1fr auto 1fr` ile sol üstte `Bağlı` sunucu durumu, tam ortada geometrik Swiss müzakere SVG logosu + başlık + navigasyon sekmeleri, sağ üstte TR/EN + Açık/Koyu tema + UI modu buton grubu.
4. 🍱 **Dengelenmiş Yönetici Paneli Bento Grid:** Sol sütunda Masa Durumu + Uzlaşı Keşfi + Fikir Kümeleme & Kamp Ayarları + Simülasyon Paneli; sağ sütunda Moderasyon Kuyruğu + Müzakere Soru Editörü + Katılımcı Listesi + Tehlikeli Bölge.
5. 🔍 **Dinamik Rule-Based Uzlaşı Keşif Motoru:** LLM API limitlerinde dahi her oturumun özel sorusu, aktif fikir grupları ve en çok onay alan gerçek görüşlerini işleyerek oturuma özel %100 benzersiz uzlaşı analizi sunan `generateRuleBasedConsensusFallback` motoru.
6. 🎯 **Giriş Ekranı (Lobby) Temizliği:** Habermas ve tanıtım kartları kaldırılarak dikey/yatay tam ortalanmış giriş formu ve "Müzakere Masası'na Hoş Geldiniz" karşılama başlığı.
7. 🛡️ **Gelişmiş Moderasyon & Katılımcı Engelleme (Ban/Kick):** Sabotaj yapan kullanıcıları masadan atma ve onay bekleyen görüş akışı.
8. 🌉 **Görüş Havuzu (Opinion Pool):** Approved olmuş tüm görüşler arasında arama yapabilme, kamplara göre süzme ve oyları canlı güncelleme.

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
| **Stil** | Vanilla CSS | Swiss Bento grid, CSS değişkenleri, responsive grid |
| **Diller** | JS (ES6+) + CSS | TR/EN i18n sözlük altyapısı |
| **İkonlar** | Lucide React | SVG tabanlı ikonlar |
| **Backend** | Express 4 + Node.js | REST API sunucusu |
| **Gerçek Zamanlı** | Socket.io 4 | Çift yönlü WebSocket iletişimi |
| **Veritabanı** | PostgreSQL / SQLite + Prisma | İlişkisel veri modeli (veya In-Memory mod) |
| **Kimlik Doğrulama** | JWT + Bcrypt | Token tabanlı şifreli doğrulama |
| **Test** | Vitest | Birim & algoritma doğruluk testleri (45/45) |

---

## 🚀 Kurulum & Çalıştırma

```bash
# 1. Bağımlılıkları yükle
npm install

# 2. Geliştirme sunucularını başlat (Frontend + Backend)
npm run dev

# 3. CompDemocracy Top 5 Açık Veri Oturumlarını Tohumla (Opsiyonel)
node server/seed_open_data.js
```

Vite sunucusu `http://localhost:5173` adresinde, Express backend ise `http://localhost:3001` adresinde çalışacaktır.

---

## 📖 Kullanım Kılavuzu

### Yönetici Paneli
* **Giriş:** `admin@muzakere.local` / `admin123`
* Panel üstünde yer alan Meta-Analiz tablosundan **BG2050**, **KLIMA22**, **VTAIWAN**, **MARCHON** veya **AMASSEM** oturumlarını tek tıkla seçip yönetebilirsiniz.
* **Uzlaşı Potansiyellerini Keşfet** butonuna basarak seçili oturumun dinamik uzlaşı ve diyalog analizi raporunu alabilirsiniz.

---

## 🧪 Test & Doğrulama

Birim testlerini çalıştırmak için:
```bash
npm run test
```
45/45 birim testi PCA boyutsallık indirgeme doğruluğunu, K-Means kümeleme yakınsamasını ve Köprü Cümle formüllerinin matematiksel doğruluğunu onaylar.

---

## 📄 Lisans

Bu proje eğitim ve araştırma amaçlı açık kaynaklı bir platformdur.
