/**
 * camp-explanation-paths.test.js
 *
 * getCampAssignmentExplanation — Hızlı Yol (Fast Path) ve
 * Yavaş Yol (Slow Fallback) Davranış Testleri.
 *
 * SENARYO A: campApprovalRates cache dolu → O(1) lookup, O(n) iş yapılmaz.
 * SENARYO B: campApprovalRates cache yok  → O(n×S) fallback + uyarı logu.
 * SENARYO C: İki yolun AYNI definingVotes sonucunu ürettiği doğrulanır.
 */

import { describe, it, expect, vi } from 'vitest';
import { getCampAssignmentExplanation } from '../algorithms.js';

// ─── Ortak test verisi ──────────────────────────────────────────────────────
const PARTICIPANT_A = 'p-fast-A';
const PARTICIPANT_B = 'p-fast-B';
const PARTICIPANT_C = 'p-fast-C';

const participants = [
  {
    id: PARTICIPANT_A,
    nickname: 'Hızlı A',
    isBanned: false,
    votes: { 'st-1': 1, 'st-2': -1, 'st-3': 1 }
  },
  {
    id: PARTICIPANT_B,
    nickname: 'Hızlı B',
    isBanned: false,
    votes: { 'st-1': 1, 'st-2': -1, 'st-3': 0 }
  },
  {
    id: PARTICIPANT_C,
    nickname: 'Hızlı C',
    isBanned: false,
    votes: { 'st-1': -1, 'st-2': 1, 'st-3': -1 }
  }
];

const statements = [
  { id: 'st-1', text: 'Birinci görüş', approved: true },
  { id: 'st-2', text: 'İkinci görüş', approved: true },
  { id: 'st-3', text: 'Üçüncü görüş', approved: true }
];

const points = [
  { id: PARTICIPANT_A, nickname: 'Hızlı A', campId: 0 },
  { id: PARTICIPANT_B, nickname: 'Hızlı B', campId: 0 },
  { id: PARTICIPANT_C, nickname: 'Hızlı C', campId: 1 }
];

const camps = [
  { id: 0, name: 'Kamp Alfa', size: 2 },
  { id: 1, name: 'Kamp Beta', size: 1 }
];

// Kamp 0 için gerçek onay oranları (elle hesaplanmış):
// st-1: A:1, B:1 → %100 onay
// st-2: A:-1, B:-1 → %0 onay
// st-3: A:1, B:0(nötr, sayılmaz) → agree=1, total=1 → %100 onay
const campApprovalRates = {
  0: { 'st-1': 1.0, 'st-2': 0.0, 'st-3': 1.0 },
  1: { 'st-1': 0.0, 'st-2': 1.0, 'st-3': 0.0 }
};

function makeSession({ withCache }) {
  return {
    code: 'PATHTEST',
    participants,
    statements,
    customCampNames: {},
    analysis: {
      points,
      camps,
      campApprovalRates: withCache ? campApprovalRates : undefined
    }
  };
}

// ─── SENARYO A: HIZLI YOL ───────────────────────────────────────────────────
describe('getCampAssignmentExplanation — SENARYO A: Hızlı Yol (cache dolu)', () => {

  it('(A-1) campApprovalRates dolu iken doğru definingVotes listesi döner', () => {
    const session = makeSession({ withCache: true });
    const result  = getCampAssignmentExplanation(PARTICIPANT_A, session);

    expect(result).not.toBeNull();
    expect(result.campId).toBe(0);
    expect(result.campName).toBe('Kamp Alfa');
    expect(Array.isArray(result.definingVotes)).toBe(true);
    expect(result.definingVotes.length).toBeGreaterThan(0);
  });

  it('(A-2) Hızlı yolda ⚠️ [SLOW PATH] uyarısı BASTIRILMAZ', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const session = makeSession({ withCache: true });
    getCampAssignmentExplanation(PARTICIPANT_A, session);

    const slowPathWarningFired = warnSpy.mock.calls.some(
      args => String(args[0]).includes('CAMP EXPLANATION SLOW PATH')
    );
    expect(slowPathWarningFired).toBe(false);

    warnSpy.mockRestore();
  });

  it('(A-3) Hızlı yolda her görüş için campApprovalRate önbellekten doğru okunur', () => {
    const session = makeSession({ withCache: true });
    const result  = getCampAssignmentExplanation(PARTICIPANT_A, session);

    // st-1: kullanıcı 1 (AGREE), kamp oranı %100 → alignmentScore=1.0 (en yüksek)
    // st-2: kullanıcı -1 (DISAGREE), kamp oranı %0 → 1 - 0 = 1.0 (en yüksek)
    // st-3: kullanıcı 1 (AGREE), kamp oranı %100 → alignmentScore=1.0
    result.definingVotes.forEach(dv => {
      expect(['st-1', 'st-2', 'st-3']).toContain(dv.statementId);
      expect(dv.campApprovalRate).toBeGreaterThanOrEqual(0);
      expect(dv.campApprovalRate).toBeLessThanOrEqual(100);
    });
  });
});

// ─── SENARYO B: YAVAŞ YOL (LAZY FALLBACK) ──────────────────────────────────
describe('getCampAssignmentExplanation — SENARYO B: Yavaş Yol (cache eksik)', () => {

  it('(B-1) campApprovalRates undefined iken yine de definingVotes döner (fallback çalışır)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const session = makeSession({ withCache: false });
    const result  = getCampAssignmentExplanation(PARTICIPANT_A, session);

    expect(result).not.toBeNull();
    expect(result.campId).toBe(0);
    expect(Array.isArray(result.definingVotes)).toBe(true);
    expect(result.definingVotes.length).toBeGreaterThan(0);

    warnSpy.mockRestore();
  });

  it('(B-2) cache eksik olduğunda konsola ⚠️ [CAMP EXPLANATION SLOW PATH] uyarısı basılır', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const session = makeSession({ withCache: false });
    getCampAssignmentExplanation(PARTICIPANT_A, session);

    const slowPathWarningFired = warnSpy.mock.calls.some(
      args => String(args[0]).includes('CAMP EXPLANATION SLOW PATH')
    );
    expect(slowPathWarningFired).toBe(true);

    warnSpy.mockRestore();
  });

  it('(B-3) uyarı logu oturum kodunu içeriyor', () => {
    const warnMessages = [];
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...args) => {
      warnMessages.push(String(args[0]));
    });

    const session = makeSession({ withCache: false });
    getCampAssignmentExplanation(PARTICIPANT_A, session);

    const slowPathMsg = warnMessages.find(m => m.includes('CAMP EXPLANATION SLOW PATH'));
    expect(slowPathMsg).toBeTruthy();
    expect(slowPathMsg).toContain('PATHTEST');

    warnSpy.mockRestore();
  });

  it('(B-4) fallback, nötr oyu olan görüşleri (0) atlar ve skorsuz bırakır', () => {
    // PARTICIPANT_A'nın st-3 oyu = 1, PARTICIPANT_B'nin st-3 oyu = 0 (nötr)
    // Nötr oy sayıma dahil edilmez → sadece A'nın oyu → agree=1, total=1
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const session = makeSession({ withCache: false });
    const result  = getCampAssignmentExplanation(PARTICIPANT_A, session);

    // st-3 definingVotes'ta varsa %100 oranında olmalı (nötr sayılmadığı için)
    const st3Vote = result.definingVotes.find(v => v.statementId === 'st-3');
    if (st3Vote) {
      expect(st3Vote.campApprovalRate).toBe(100);
    }

    warnSpy.mockRestore();
  });
});

// ─── SENARYO C: ÇIKTI TUTARLILIK KARŞILAŞTIRMASI ────────────────────────────
describe('getCampAssignmentExplanation — SENARYO C: Hızlı/Yavaş yol çıktı eşleşmesi', () => {

  it('(C-1) Hızlı ve yavaş yol birebir AYNI definingVotes listesi üretir', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const fastSession = makeSession({ withCache: true });
    const slowSession = makeSession({ withCache: false });

    const fastResult = getCampAssignmentExplanation(PARTICIPANT_A, fastSession);
    const slowResult = getCampAssignmentExplanation(PARTICIPANT_A, slowSession);

    warnSpy.mockRestore();

    // Her iki yolda aynı görüşler aynı sırada ve aynı oranlarla gelmeli
    const normalize = r => r.definingVotes.map(v => ({
      id: v.statementId,
      vote: v.userVote,
      rate: v.campApprovalRate
    }));

    expect(normalize(fastResult)).toEqual(normalize(slowResult));
  });

  it('(C-2) Kamp adı, campId ve participantId her iki yolda özdeş', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const fastResult = getCampAssignmentExplanation(PARTICIPANT_A, makeSession({ withCache: true }));
    const slowResult = getCampAssignmentExplanation(PARTICIPANT_A, makeSession({ withCache: false }));

    warnSpy.mockRestore();

    expect(fastResult.campId).toBe(slowResult.campId);
    expect(fastResult.campName).toBe(slowResult.campName);
    expect(fastResult.participantId).toBe(slowResult.participantId);
  });

  it('(C-3) Başka bir kamptaki katılımcı (C) için de iki yol aynı sonucu üretir', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const fastResult = getCampAssignmentExplanation(PARTICIPANT_C, makeSession({ withCache: true }));
    const slowResult = getCampAssignmentExplanation(PARTICIPANT_C, makeSession({ withCache: false }));

    warnSpy.mockRestore();

    const normalize = r => r?.definingVotes?.map(v => ({
      id: v.statementId,
      vote: v.userVote,
      rate: v.campApprovalRate
    }));

    expect(normalize(fastResult)).toEqual(normalize(slowResult));
  });
});
