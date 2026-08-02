import { describe, it, expect } from 'vitest';
import { calculatePolarisability } from '../algorithms.js';

describe('Kutuplaşma Derecesi (Polarisability) Birim Testleri', () => {

  it('Toplam Varyans 0 olduğunda (Guard Clause: K=1 veya tüm noktalar çakışık)', () => {
    const points = [
      { id: 'p-1', x: 10, y: 10, campId: 0 },
      { id: 'p-2', x: 10, y: 10, campId: 0 },
      { id: 'p-3', x: 10, y: 10, campId: 0 }
    ];
    const camps = [{ id: 0, size: 3, x: 10, y: 10 }];

    const result = calculatePolarisability(points, camps);
    expect(result.polarisability).toBeNull();
    expect(result.insufficientVariance).toBe(true);
  });

  it('Yüksek Kutuplaşma (Uçlarda toplanmış iki eşit grup)', () => {
    const points = [
      { id: 'p-1', x: -50, y: 0, campId: 0 },
      { id: 'p-2', x: -50, y: 0, campId: 0 },
      { id: 'p-3', x:  50, y: 0, campId: 1 },
      { id: 'p-4', x:  50, y: 0, campId: 1 }
    ];
    const camps = [
      { id: 0, size: 2, x: -50, y: 0 },
      { id: 1, size: 2, x:  50, y: 0 }
    ];

    const result = calculatePolarisability(points, camps);
    expect(result.polarisability).toBe(100);
    expect(result.insufficientVariance).toBe(false);
  });

  it('Grup büyüklüğü ağırlıklandırması (Ağırlıklı formülün büyük gruba hassasiyeti)', () => {
    const pointsEqual = [
      { id: 'p1',  x: -10, y:  0, campId: 0 },
      { id: 'p2',  x: -15, y:  0, campId: 0 },
      { id: 'p3',  x:  -5, y:  0, campId: 0 },
      { id: 'p4',  x: -10, y:  5, campId: 0 },
      { id: 'p5',  x: -10, y: -5, campId: 0 },
      { id: 'p6',  x:  10, y:  0, campId: 1 },
      { id: 'p7',  x:  15, y:  0, campId: 1 },
      { id: 'p8',  x:   5, y:  0, campId: 1 },
      { id: 'p9',  x:  10, y:  5, campId: 1 },
      { id: 'p10', x:  10, y: -5, campId: 1 }
    ];
    const campsEqual = [
      { id: 0, size: 5, x: -10, y: 0 },
      { id: 1, size: 5, x:  10, y: 0 }
    ];

    const pointsUnbalanced = [
      { id: 'p1', x: -10, y:  0, campId: 0 },
      { id: 'p2', x: -15, y:  0, campId: 0 },
      { id: 'p3', x:  -5, y:  0, campId: 0 },
      { id: 'p4', x: -10, y:  5, campId: 0 },
      { id: 'p5', x: -10, y: -5, campId: 0 },
      { id: 'p6', x: -12, y:  2, campId: 0 },
      { id: 'p7', x:  -8, y: -2, campId: 0 },
      { id: 'p8', x: -11, y: -1, campId: 0 },
      { id: 'p9', x:  -9, y:  1, campId: 0 },
      { id: 'p10', x: 10, y:  0, campId: 1 }
    ];
    const campsUnbalanced = [
      { id: 0, size: 9, x: -10, y: 0 },
      { id: 1, size: 1, x:  10, y: 0 }
    ];

    const resEqual      = calculatePolarisability(pointsEqual,      campsEqual);
    const resUnbalanced = calculatePolarisability(pointsUnbalanced, campsUnbalanced);

    expect(Math.round(resEqual.polarisability)).toBe(83);
    expect(Math.round(resUnbalanced.polarisability)).toBe(75);
    expect(resEqual.polarisability).toBeGreaterThan(resUnbalanced.polarisability);
  });

  // ─── YENİ EDGE-CASE TESTLERİ ──────────────────────────────────────────────

  it('EDGE CASE (4) — Boş points dizisi: erken return, null ve insufficientVariance=true', () => {
    const result = calculatePolarisability([], []);
    expect(result.polarisability).toBeNull();
    expect(result.insufficientVariance).toBe(true);
  });

  it('EDGE CASE (5) — Tek katılımcı: genel merkez = nokta → totalVariance = 0 → null', () => {
    const points = [{ id: 'p-solo', x: 5, y: 10, campId: 0 }];
    const camps  = [{ id: 0, size: 1, x: 5, y: 10 }];

    const result = calculatePolarisability(points, camps);
    // Tek nokta: totalVariance = 0 → insufficientVariance guard devreye girer
    expect(result.polarisability).toBeNull();
    expect(result.insufficientVariance).toBe(true);
  });

  it('EDGE CASE (6) — K=1, tüm katılımcılar aynı kampta ama farklı konumlarda: polarisability=0', () => {
    // Katılımcılar tek kampta ama dağınık konumlarda → totalVariance > 0
    // ama betweenCampVariance = 0 (tek kamp merkezi = genel merkez)
    const points = [
      { id: 'p-1', x: -10, y:  0, campId: 0 },
      { id: 'p-2', x:  10, y:  0, campId: 0 },
      { id: 'p-3', x:   0, y:  5, campId: 0 }
    ];
    const campCenterX = (-10 + 10 + 0) / 3; // 0
    const campCenterY = (0 + 0 + 5) / 3;     // ~1.667
    const camps = [{ id: 0, size: 3, x: campCenterX, y: campCenterY }];

    const result = calculatePolarisability(points, camps);
    // betweenCampVariance = 3 * ||campCenter - genel merkez||² = 3 * 0 = 0
    // polarisability = 0%  → kutuplaşma yok ama hesap geçerli
    expect(result.insufficientVariance).toBe(false);
    expect(result.polarisability).toBe(0);
  });

  it('EDGE CASE (7) — Boş kamp (size=0): hesap patlamadan tamamlanmalı, sonuç geçerli', () => {
    // Kamp 1 dolu, Kamp 2 boş (size=0) → betweenCampVariance'a 0 katkısı olur
    const points = [
      { id: 'p-1', x: -20, y: 0, campId: 0 },
      { id: 'p-2', x: -20, y: 0, campId: 0 },
      { id: 'p-3', x:  20, y: 0, campId: 0 }
    ];
    const camps = [
      { id: 0, size: 3, x: -6.67, y: 0 }, // genel merkez ≈ (-6.67, 0)
      { id: 1, size: 0, x:  50, y: 0 }     // boş kamp — hiç üye yok
    ];

    // size=0 kamp → betweenCampVariance'a 0 * d² = 0 katkısı (hata fırlatmaz)
    const result = calculatePolarisability(points, camps);
    expect(result).toHaveProperty('polarisability');
    expect(result).toHaveProperty('insufficientVariance');
    // Hata fırlatmaması yeterli
    expect(() => calculatePolarisability(points, camps)).not.toThrow();
  });

  it('EDGE CASE (8) — Koordinat sınırı ±80: güvenlik kancası (>100.5) tetiklenmemeli', () => {
    // Noktalar tam kamp merkezlerinde → maksimum kutuplaşma, hata değil
    const points = [
      { id: 'p-1', x: -80, y: 0, campId: 0 },
      { id: 'p-2', x: -80, y: 0, campId: 0 },
      { id: 'p-3', x:  80, y: 0, campId: 1 },
      { id: 'p-4', x:  80, y: 0, campId: 1 }
    ];
    const camps = [
      { id: 0, size: 2, x: -80, y: 0 },
      { id: 1, size: 2, x:  80, y: 0 }
    ];

    const result = calculatePolarisability(points, camps);
    expect(result.polarisability).toBe(100);
    expect(result.insufficientVariance).toBe(false);
  });

});
