import { describe, it, expect } from 'vitest';
import { calculatePolarisability } from '../algorithms.js';

describe('Kutuplaşma Derecesi (Polarisability) Birim Testleri', () => {

  it('Toplam Varyans 0 olduğunda (Guard Clause: K=1 veya tüm noktalar çakışık)', () => {
    // Tüm katılımcılar aynı noktada
    const points = [
      { id: 'p-1', x: 10, y: 10, campId: 0 },
      { id: 'p-2', x: 10, y: 10, campId: 0 },
      { id: 'p-3', x: 10, y: 10, campId: 0 }
    ];
    const camps = [
      { id: 0, size: 3, x: 10, y: 10 }
    ];

    const result = calculatePolarisability(points, camps);
    expect(result.polarisability).toBeNull();
    expect(result.insufficientVariance).toBe(true);
  });

  it('Yüksek Kutuplaşma (Uçlarda toplanmış iki eşit grup)', () => {
    // Noktalar tamamen küme merkezlerinde (maximum ayrışma)
    const points = [
      { id: 'p-1', x: -50, y: 0, campId: 0 },
      { id: 'p-2', x: -50, y: 0, campId: 0 },
      { id: 'p-3', x: 50, y: 0, campId: 1 },
      { id: 'p-4', x: 50, y: 0, campId: 1 }
    ];
    // Genel merkez = 0,0
    const camps = [
      { id: 0, size: 2, x: -50, y: 0 },
      { id: 1, size: 2, x: 50, y: 0 }
    ];

    const result = calculatePolarisability(points, camps);
    expect(result.polarisability).toBe(100);
    expect(result.insufficientVariance).toBe(false);
  });

  it('Grup büyüklüğü ağırlıklandırması (Ağırlıklı formülün büyük gruba hassasiyeti)', () => {
    // 1. Durum: Eşit büyüklükte iki grup (5 vs 5) ile yayılım
    const pointsEqual = [
      // Sol grup (merkez -10): yayılmış
      { id: 'p1', x: -10, y: 0, campId: 0 },
      { id: 'p2', x: -15, y: 0, campId: 0 },
      { id: 'p3', x: -5, y: 0, campId: 0 },
      { id: 'p4', x: -10, y: 5, campId: 0 },
      { id: 'p5', x: -10, y: -5, campId: 0 },
      // Sağ grup (merkez 10): yayılmış
      { id: 'p6', x: 10, y: 0, campId: 1 },
      { id: 'p7', x: 15, y: 0, campId: 1 },
      { id: 'p8', x: 5, y: 0, campId: 1 },
      { id: 'p9', x: 10, y: 5, campId: 1 },
      { id: 'p10', x: 10, y: -5, campId: 1 }
    ];
    const campsEqual = [
      { id: 0, size: 5, x: -10, y: 0 },
      { id: 1, size: 5, x: 10, y: 0 }
    ];

    const resEqual = calculatePolarisability(pointsEqual, campsEqual);

    // 2. Durum: Eşitsiz büyüklükte iki grup (9 vs 1) ile aynı yayılım
    const pointsUnbalanced = [
      // Sol grup (merkez -10) - 9 kişi
      { id: 'p1', x: -10, y: 0, campId: 0 },
      { id: 'p2', x: -15, y: 0, campId: 0 },
      { id: 'p3', x: -5, y: 0, campId: 0 },
      { id: 'p4', x: -10, y: 5, campId: 0 },
      { id: 'p5', x: -10, y: -5, campId: 0 },
      { id: 'p6', x: -12, y: 2, campId: 0 },
      { id: 'p7', x: -8, y: -2, campId: 0 },
      { id: 'p8', x: -11, y: -1, campId: 0 },
      { id: 'p9', x: -9, y: 1, campId: 0 },
      // Sağ grup (merkez 10) - 1 kişi
      { id: 'p10', x: 10, y: 0, campId: 1 }
    ];
    const campsUnbalanced = [
      { id: 0, size: 9, x: -10, y: 0 },
      { id: 1, size: 1, x: 10, y: 0 }
    ];

    const resUnbalanced = calculatePolarisability(pointsUnbalanced, campsUnbalanced);

    // Eşit gruplarda kutuplaşma derecesi, dengesiz gruba göre daha yüksek çıkacaktır.
    expect(Math.round(resEqual.polarisability)).toBe(83);
    expect(Math.round(resUnbalanced.polarisability)).toBe(75);
    expect(resEqual.polarisability).toBeGreaterThan(resUnbalanced.polarisability);
  });

});
