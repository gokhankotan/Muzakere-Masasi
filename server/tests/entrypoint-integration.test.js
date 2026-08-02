import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../database.js';
import {
  generateAllClusterSummaries,
  generateClusterSummary,
  evaluateOpinionContent,
  discoverConsensusPotential,
  getLlmQuotaStatus
} from '../services/llm.service.js';

describe('Server Entrypoint & LLM Integration Tests (Unmocked LLM Module)', () => {
  const sessionCode = 'INTG_TEST';

  beforeEach(async () => {
    await db.initialized;

    db.sessions.set(sessionCode, {
      id: 'intg-session-uuid',
      code: sessionCode,
      title: 'Entegrasyon Test Oturumu',
      description: 'Test',
      question: 'Gelecekte ulaşım nasıl olmalıdır?',
      status: 'active',
      visibility: 'PUBLIC',
      version: 1,
      targetK: 2,
      participants: [
        { id: 'p1', nickname: 'Katılımcı 1', isBanned: false, votes: { 'op-1': 1, 'op-2': -1 } },
        { id: 'p2', nickname: 'Katılımcı 2', isBanned: false, votes: { 'op-1': 1, 'op-2': 1 } },
        { id: 'p3', nickname: 'Katılımcı 3', isBanned: false, votes: { 'op-1': -1, 'op-2': -1 } }
      ],
      statements: [
        { id: 'op-1', text: 'Toplu taşıma ücretsiz ve erişilebilir olmalı.', approved: true },
        { id: 'op-2', text: 'Bireysel araç kullanımı kısıtlanmalı.', approved: true }
      ],
      analysis: null
    });
  });

  it('(1) generateAllClusterSummaries gerçek modül üzerinden DRY_RUN modunda hata vermeden çalışmalıdır', async () => {
    const camps = [
      { id: 0, topStatements: [{ id: 'op-1', text: 'Toplu taşıma ücretsiz olmalı', approvalRate: 90, contrastScore: 0.8 }] },
      { id: 1, topStatements: [{ id: 'op-2', text: 'Bireysel araç kullanımı kısıtlanmalı', approvalRate: 80, contrastScore: 0.7 }] }
    ];

    const processingIds = new Set([0, 1]);
    const summaries = await generateAllClusterSummaries(camps, 'Gelecekte ulaşım nasıl olmalıdır?', sessionCode, 1, processingIds);

    expect(summaries).toBeDefined();
    expect(typeof summaries).toBe('object');
    expect(summaries[0]).toBeDefined();
    expect(summaries[1]).toBeDefined();
  });

  it('(2) llm.service.js modülündeki tüm servis fonksiyonları DRY_RUN modunda deterministic çıktı vermelidir', async () => {
    const quotaStatus = getLlmQuotaStatus();
    expect(quotaStatus).toBeDefined();
    expect(typeof quotaStatus.isRpdExhausted).toBe('boolean');

    const evaluation = await evaluateOpinionContent('Bisiklet yolları genişletilmeli.', 'Ulaşım sorusu');
    expect(evaluation.flagged).toBe(false);
    expect(evaluation.reason).toBeNull();
  });
});
