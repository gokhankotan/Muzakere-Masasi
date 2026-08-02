/**
 * Müzakere Masası - Gerekçe Kalitesi Servisi
 * Görüş metinleri için kural tabanlı bir gerekçe kalitesi skoru hesaplar.
 * LLM'e ihtiyaç duymaz — saf metin analizi ile çalışır.
 *
 * Azınlık Görüşü (Minority Opinion Shield) özelliği için kullanılır.
 */

/** Türkçe gerekçe/bağlaç belirteçleri */
const TR_REASONING_MARKERS = [
  'çünkü', 'zira', 'bu nedenle', 'bu yüzden', 'bu sebeple',
  'dolayısıyla', 'nitekim', 'öte yandan',
  'örneğin', 'örnek olarak', 'dahası', 'üstelik',
  'buna göre', 'buna karşın', 'buna rağmen', 'bunun yanı sıra',
  'bununla birlikte', 'özellikle', 'ayrıca', 'sonuç olarak',
  'bu bağlamda', 'düşünüyorum ki', 'inanıyorum ki',
  'şöyle ki', 'hâlbuki', 'oysa', 'oysaki', 'aksine', 'tersine',
  'her şeyden önce', 'ilk olarak', 'ikinci olarak', 'son olarak',
  'en önemlisi', 'kanımca', 'kanımızca', 'görüşüme göre'
];

/** İngilizce gerekçe belirteçleri (çok dilli oturumlar için) */
const EN_REASONING_MARKERS = [
  'because', 'therefore', 'thus', 'hence', 'since',
  'for example', 'for instance', 'in particular',
  'furthermore', 'moreover', 'additionally', 'however',
  'nevertheless', 'consequently', 'as a result', 'in conclusion',
  'most importantly', 'in contrast', 'on the other hand',
  'despite', 'although', 'i believe', 'i think', 'in my opinion',
  'should be', 'need to', 'in order to', 'it is time'
];

/** Almanca gerekçe belirteçleri (KLIMA22 vb. Almanca oturumlar için) */
const DE_REASONING_MARKERS = [
  'weil', 'deshalb', 'daher', 'weshalb', 'da',
  'zum beispiel', 'beispielsweise', 'insbesondere',
  'ausserdem', 'darüber hinaus', 'jedoch', 'dennoch',
  'folglich', 'zusammenfassend', 'meiner meinung nach',
  'ich glaube', 'ich denke', 'zwar', 'obwohl',
  'klimarat', 'soll', 'muss', 'sollte', 'für'
];

/**
 * Görüş metni için 0-100 arası kural tabanlı gerekçe kalitesi skoru hesaplar.
 * LLM kullanmaz; tamamen deterministik ve anlık çalışır.
 *
 * @param {string} text - Görüş metni
 * @returns {number} 0-100 arası skor (tam sayı)
 */
export function calculateReasoningQualityScore(text) {
  if (!text || typeof text !== 'string') return 0;

  const trimmed = text.trim();
  const len = trimmed.length;
  if (len < 5) return 0;

  const lower = trimmed.toLowerCase();

  // ─── 1. Uzunluk Skoru (0-45 puan) ───────────────────────────────────────
  // 15-40 kar.      → 10-20 puan
  // 40-100 kar.     → 20-35 puan
  // 100+ kar.       → 35-45 puan
  let lengthScore = 0;
  if (len < 15) {
    lengthScore = 5;
  } else if (len < 40) {
    lengthScore = Math.round(10 + ((len - 15) / 25) * 10);
  } else if (len < 100) {
    lengthScore = Math.round(20 + ((len - 40) / 60) * 15);
  } else {
    lengthScore = Math.min(45, Math.round(35 + ((len - 100) / 150) * 10));
  }

  // ─── 2. Gerekçe Belirteci Skoru (0-40 puan) ─────────────────────────────
  let markerCount = 0;
  const foundMarkers = new Set();

  for (const marker of TR_REASONING_MARKERS) {
    if (!foundMarkers.has(marker) && lower.includes(marker)) {
      foundMarkers.add(marker);
      markerCount++;
    }
  }
  for (const marker of EN_REASONING_MARKERS) {
    if (!foundMarkers.has(marker) && lower.includes(marker)) {
      foundMarkers.add(marker);
      markerCount++;
    }
  }
  for (const marker of DE_REASONING_MARKERS) {
    if (!foundMarkers.has(marker) && lower.includes(marker)) {
      foundMarkers.add(marker);
      markerCount++;
    }
  }
  const markerScore = Math.min(40, markerCount * 15);

  // ─── 3. Yapısal Kalite Skoru (0-25 puan) ─────────────────────────────────
  let structureScore = 0;

  const sentences = trimmed.split(/[.!?]+/).filter(s => s.trim().length > 3);
  if (sentences.length >= 2) structureScore += 10;
  if (trimmed.includes(',')) structureScore += 6;
  if (/\d/.test(trimmed)) structureScore += 4;
  if (trimmed.includes('(') || trimmed.includes('[') || trimmed.includes(':')) structureScore += 5;

  structureScore = Math.min(25, structureScore);

  // ─── Toplam ──────────────────────────────────────────────────────────────
  return Math.min(100, Math.max(0, lengthScore + markerScore + structureScore));
}
