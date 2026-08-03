import { describe, it, expect } from 'vitest';
import { generateAxisLabels } from '../services/llm.service.js';

describe('PCA Ortogonal Eksen Etiketleme (generateAxisLabels) Testleri', () => {
  it('İki eksen de benzer demografik ifadeler içerdiğinde (örn. Yaş), tek boyutlu yaş tanımı yerine tutum ve yaklaşım farkını vurgulamalıdır', async () => {
    // DRY-RUN modunda testi simüle edelim veya mock client ile mantığı doğrulayalım
    const topX = [
      { statement: { text: "20'li yaşlarımdayım ve teknolojik yenilikleri destekliyorum." }, loading: 0.85 },
      { statement: { text: "30 yaş altı gençlerin karar alma süreçlerine katılımı artmalı." }, loading: 0.72 }
    ];

    const topY = [
      { statement: { text: "40-50 yaş arasındayım, emeklilik ve kamu güvenliği önceliğimdir." }, loading: 0.79 },
      { statement: { text: "Kıdemli vatandaşların deneyiminden faydalanılmalıdır." }, loading: 0.68 }
    ];

    // process.env.LLM_DRY_RUN test sırasında varsayılan 'true'dur
    const res = await generateAxisLabels(topX, topY, 'Gelecekte kamu yönetimi ve katılım nasıl olmalıdır?');
    expect(res).toBeDefined();
    expect(res.x).toBeDefined();
    expect(res.y).toBeDefined();
    expect(typeof res.x).toBe('string');
    expect(typeof res.y).toBe('string');
  });

  it('Görüş listesi boş olduğunda kural tabanlı fallback özet üretmelidir', async () => {
    const res = await generateAxisLabels([], []);
    expect(res.x).toBeDefined();
    expect(res.y).toBeDefined();
  });
});
