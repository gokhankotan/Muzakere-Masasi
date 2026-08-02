/**
 * incremental-cluster-summary.test.js
 *
 * dirtyCamps Mekanizması ve Artımlı (Incremental) Küme Özeti Üretimi
 * Birim Testleri.
 *
 * Test edilen davranışlar:
 *  1. markCampDirty temel davranış ve timestamp kaydı
 *  2. markCampDirty geçersiz ID'leri yok sayar (ID >= targetK)
 *  3. getDirtyCamps bağımsız kopya döndürür
 *  4. clearDirtyCamps snapshotTime=null ile koşulsuz temizler
 *  5. YARIŞ DURUMU: snapshotTime sonrası mutasyon korunur (SİLİNMEZ)
 *  6. YARIŞ DURUMU: snapshotTime öncesi mutasyon güvenle temizlenir
 *  7. markAllCampsDirty tüm kampları kirli işaretler
 *  8. updateSessionCampsCount K azaltıldığında eski kamp ID'leri temizlenir
 *  9. updateSessionCampsCount K arttırıldığında mevcut veriler korunur
 * 10. Hiçbir kamp dirty değilken generateAllClusterSummaries cache'ten döner
 * 11. Sadece 1 kamp dirty iken diğerleri cache'ten korunur
 * 12. dirtyCampIds=null → tüm kamplar dirty kabul edilir (ilk analiz)
 * 13. camps boş ise {} döner
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { generateAllClusterSummaries } from '../services/llm.service.js';
import { db } from '../database.js';

const TEST_CODE = 'INCTEST';

function setupTestSession(targetK = 3) {
  db.sessions.set(TEST_CODE, {
    targetK,
    participants: [],
    statements: [],
    customCampNames: {},
    analysis: null,
    pendingMutationCount: 0,
    pendingVotes: 0,
    pendingOpinions: 0,
    dirtyCamps: new Set(),
    dirtyCampTimestamps: new Map()
  });
}

const makeCamps = (ids, summaries = {}) => ids.map(id => ({
  id,
  name: `Grup ${String.fromCharCode(65 + id)}`,
  topStatements: [{ text: `Görüş ${id}`, approvalRate: 70 }],
  summary: summaries[id] || `Mevcut özet ${id}`
}));

// ─── DATABASE METOD TESTLERİ ────────────────────────────────────────────────
describe('dirtyCamps Mekanizması — Birim Testleri', () => {
  beforeEach(() => {
    setupTestSession(3);
  });

  it('(1) markCampDirty, geçerli kamp ID\'sini dirtyCamps ve dirtyCampTimestamps\'e ekler', () => {
    const before = Date.now() - 1;
    db.markCampDirty(TEST_CODE, 0);
    db.markCampDirty(TEST_CODE, 1);

    const dirty = db.getDirtyCamps(TEST_CODE);
    expect(dirty.has(0)).toBe(true);
    expect(dirty.has(1)).toBe(true);
    expect(dirty.has(2)).toBe(false);

    const session = db.sessions.get(TEST_CODE);
    expect(session.dirtyCampTimestamps.get(0)).toBeGreaterThanOrEqual(before);
    expect(session.dirtyCampTimestamps.get(1)).toBeGreaterThanOrEqual(before);
  });

  it('(2) markCampDirty, targetK >= ID olan kampları yok sayar (geçersiz aralık)', () => {
    db.markCampDirty(TEST_CODE, 3);  // targetK=3, ID=3 geçersiz (0-2 arası geçerli)
    db.markCampDirty(TEST_CODE, 99);

    const dirty = db.getDirtyCamps(TEST_CODE);
    expect(dirty.size).toBe(0);
  });

  it('(3) getDirtyCamps, iç dirtyCamps setinin BAĞIMSIZ bir kopyasını döndürür (referans güvenliği)', () => {
    db.markCampDirty(TEST_CODE, 0);

    const snapshot = db.getDirtyCamps(TEST_CODE);
    // Döndürülen seti mutate etmek iç seti değiştirmemeli
    snapshot.add(999);

    const internalDirty = db.getDirtyCamps(TEST_CODE);
    expect(internalDirty.has(999)).toBe(false);
    expect(internalDirty.size).toBe(1);
  });

  it('(4) clearDirtyCamps, snapshotTime=null olduğunda verilen ID\'leri koşulsuz temizler', () => {
    db.markCampDirty(TEST_CODE, 0);
    db.markCampDirty(TEST_CODE, 1);

    db.clearDirtyCamps(TEST_CODE, [0], null);

    const dirty = db.getDirtyCamps(TEST_CODE);
    expect(dirty.has(0)).toBe(false);   // Temizlenmeli
    expect(dirty.has(1)).toBe(true);    // Dokunulmamış kalmalı
  });

  it('(5) YARIŞ DURUMU: clearDirtyCamps snapshotTime\'dan SONRA gelen mutasyonları SİLMEZ', async () => {
    db.markCampDirty(TEST_CODE, 0);  // LLM öncesi kirli

    const snapshotTime = Date.now();

    // Kısa gecikme: LLM çağrısı sırasında kamp 0'a yeni mutasyon geldi
    await new Promise(r => setTimeout(r, 10));
    db.markCampDirty(TEST_CODE, 0);  // snapshotTime'dan SONRA gelen mutasyon

    // LLM tamamlandı → clearDirtyCamps snapshotTime ile çağrılır
    db.clearDirtyCamps(TEST_CODE, [0], snapshotTime);

    // Kamp 0 hâlâ dirty kalmalı (çünkü snapshotTime sonrası mutasyon aldı)
    const dirty = db.getDirtyCamps(TEST_CODE);
    expect(dirty.has(0)).toBe(true);
  });

  it('(6) YARIŞ DURUMU: snapshotTime\'dan ÖNCE gelen mutasyon güvenle temizlenebilir', () => {
    // Kamp 1 kirletildi
    db.markCampDirty(TEST_CODE, 1);

    // snapshotTime şimdiden 1 saniye sonrası — yani kamp 1'in timestamp'i bu değerin öncesinde
    const snapshotTime = Date.now() + 1000;

    // Tüm timestamps, snapshotTime'dan önce → temizlenmeli
    db.clearDirtyCamps(TEST_CODE, [1], snapshotTime);

    const dirty = db.getDirtyCamps(TEST_CODE);
    expect(dirty.has(1)).toBe(false);
  });

  it('(7) markAllCampsDirty, 0..(targetK-1) aralığındaki tüm kamp ID\'lerini kirli işaretler', () => {
    db.markAllCampsDirty(TEST_CODE);  // targetK=3

    const dirty = db.getDirtyCamps(TEST_CODE);
    expect(dirty.has(0)).toBe(true);
    expect(dirty.has(1)).toBe(true);
    expect(dirty.has(2)).toBe(true);
    expect(dirty.size).toBe(3);
  });

  it('(8) updateSessionCampsCount K=5→3 olunca eski kamp ID\'leri (3, 4) temizlenir', () => {
    // 5 kampla başla
    const session = db.sessions.get(TEST_CODE);
    session.targetK = 5;
    session.dirtyCamps = new Set([0, 1, 2, 3, 4]);
    session.dirtyCampTimestamps = new Map([[0, 1], [1, 1], [2, 1], [3, 1], [4, 1]]);
    session.customCampNames = { 0: 'Grup A', 1: 'Grup B', 3: 'Eski Grup D', 4: 'Eski Grup E' };
    session.analysis = {
      camps: [{ id: 0 }, { id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
      campApprovalRates: { 0: {}, 1: {}, 2: {}, 3: {}, 4: {} }
    };

    // K'yı 3'e düşür
    db.updateSessionCampsCount(TEST_CODE, 3);

    const dirty = db.getDirtyCamps(TEST_CODE);

    // Geçerli kamplar (0, 1, 2) kirli olmalı (markAllCampsDirty çağrısından)
    expect(dirty.has(0)).toBe(true);
    expect(dirty.has(1)).toBe(true);
    expect(dirty.has(2)).toBe(true);

    // Artık geçersiz kamplar (3, 4) temizlenmiş olmalı
    expect(dirty.has(3)).toBe(false);
    expect(dirty.has(4)).toBe(false);

    const updatedSession = db.sessions.get(TEST_CODE);

    // analysis.camps içinden eski ID'ler kaldırılmalı
    expect(updatedSession.analysis.camps.every(c => c.id < 3)).toBe(true);

    // campApprovalRates'ten eski ID'ler kaldırılmalı
    expect('3' in updatedSession.analysis.campApprovalRates).toBe(false);
    expect('4' in updatedSession.analysis.campApprovalRates).toBe(false);

    // customCampNames'ten eski ID'ler kaldırılmalı
    expect('3' in updatedSession.customCampNames).toBe(false);
    expect('4' in updatedSession.customCampNames).toBe(false);
  });

  it('(9) updateSessionCampsCount K=3→5 olunca mevcut özel isimler ve veriler korunur', () => {
    const session = db.sessions.get(TEST_CODE);
    session.targetK = 3;
    session.customCampNames = { 0: 'Özel İsim A' };

    db.updateSessionCampsCount(TEST_CODE, 5);

    const updatedSession = db.sessions.get(TEST_CODE);
    expect(updatedSession.targetK).toBe(5);
    // Mevcut özel isimler korunmalı
    expect(updatedSession.customCampNames['0']).toBe('Özel İsim A');

    // Yeni kamplar (0..4) hepsi dirty olmalı
    const dirty = db.getDirtyCamps(TEST_CODE);
    expect(dirty.size).toBe(5);
  });
});

// ─── generateAllClusterSummaries SEÇİCİ BATCH TESTLERİ ─────────────────────
describe('generateAllClusterSummaries — Artımlı (Selective) Batch Testleri', () => {
  it('(10) Hiçbir kamp dirty değilken generateAllClusterSummaries LLM\'e istek göndermez, özetler cache\'ten döner', async () => {
    const camps = makeCamps([0, 1, 2], { 0: 'Özet A', 1: 'Özet B', 2: 'Özet C' });
    const emptyDirtySet = new Set(); // Hiçbir kamp dirty değil

    const result = await generateAllClusterSummaries(camps, 'Soru?', 'INCBATCH1', 1, emptyDirtySet);

    // Dirty set boş → doğrudan camp.summary değerleri dönmeli
    expect(result[0]).toBe('Özet A');
    expect(result[1]).toBe('Özet B');
    expect(result[2]).toBe('Özet C');
  });

  it('(11) Sadece kamp 1 dirty iken, kamp 0 ve 2\'nin özetleri cache\'ten korunur', async () => {
    const camps = makeCamps([0, 1, 2], { 0: 'Önbellek A', 1: 'Eski özet B', 2: 'Önbellek C' });
    const onlyOneDirty = new Set([1]); // Sadece kamp 1 dirty

    const originalDryRun = process.env.LLM_DRY_RUN;
    process.env.LLM_DRY_RUN = 'true';

    const result = await generateAllClusterSummaries(camps, 'Soru?', 'INCBATCH2', 1, onlyOneDirty);

    process.env.LLM_DRY_RUN = originalDryRun;

    // Kamp 0 ve 2: cache'ten korunmuş olmalı
    expect(result[0]).toBe('Önbellek A');
    expect(result[2]).toBe('Önbellek C');

    // Kamp 1: dirty → fallback (LLM_DRY_RUN=true olduğundan kural tabanlı fallback)
    expect(typeof result[1]).toBe('string');
    expect(result[1]).toBeTruthy();
  });

  it('(12) dirtyCampIds=null olduğunda (ilk analiz) tüm kamplar dirty kabul edilir, tüm özetler üretilir', async () => {
    const camps = makeCamps([0, 1, 2]);

    const originalDryRun = process.env.LLM_DRY_RUN;
    process.env.LLM_DRY_RUN = 'true';

    const result = await generateAllClusterSummaries(camps, 'Soru?', 'INCBATCH3', 1, null);

    process.env.LLM_DRY_RUN = originalDryRun;

    // Tüm kamplar dirty → tüm kamplara fallback özet üretilmeli
    expect(Object.keys(result).length).toBe(3);
    [0, 1, 2].forEach(id => {
      expect(typeof result[id]).toBe('string');
      expect(result[id]).toBeTruthy();
    });
  });

  it('(13) camps dizisi boş ise {} döner, hata fırlatmaz', async () => {
    const result = await generateAllClusterSummaries([], 'Soru?', 'INCBATCH4', 1, new Set([0]));
    expect(result).toEqual({});
  });
});
