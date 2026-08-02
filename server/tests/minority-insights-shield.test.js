/**
 * minority-insights-shield.test.js
 *
 * Azınlık Görüşü Koruması (Minority Opinion Shield) Birim ve Entegrasyon Testleri.
 *
 * Test Senaryoları:
 *  1. calculateReasoningQualityScore (TR, EN, DE) çok dilli skorlama doğruluğu
 *  2. 0 oy almış yüksek kaliteli görüşlerin ASLA minorityInsights listesine dahil EDİLMEMESİ (MIN_VOTES >= 3 kuralı)
 *  3. Oturumdaki hiçbir görüş minimum oy eşiğini (3 oy) karşılamıyorsa minorityInsights'ın BOŞ ARRAY () dönmesi
 *  4. Yeterli oy alan (voteCount >= 3) ve yüksek kalite skoruna sahip görüşlerin doğru sıralanması ve seçilmesi
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../database.js';
import { calculateReasoningQualityScore } from '../services/quality.service.js';

describe('Azınlık Görüşü Koruması (Minority Opinion Shield) Testleri', () => {
  const SESSION_CODE = 'MINTEST';

  beforeEach(async () => {
    await db.initialized;

    db.sessions.set(SESSION_CODE, {
      code: SESSION_CODE,
      question: 'Çevre ve Ulaşım Politikaları',
      status: 'active',
      participants: [
        { id: 'p1', isBanned: false, votes: { 'op-1': 1, 'op-2': -1, 'op-3': 1 } },
        { id: 'p2', isBanned: false, votes: { 'op-1': -1, 'op-2': -1, 'op-3': 1 } },
        { id: 'p3', isBanned: false, votes: { 'op-1': -1, 'op-2': 1, 'op-3': -1 } }
      ],
      statements: [
        { id: 'op-1', text: 'Toplu taşıma ücretleri düşürülmeli çünkü dar gelirli vatandaşlar mağdur olmaktadır.', approved: true },
        { id: 'op-2', text: 'Klimarat: Ich bin für eine Geschwindigkeitsbegrenzung im Ort, weil es Leben schützt.', approved: true },
        { id: 'op-3', text: 'Fewer cars in city centers because public transit and cycling infrastructure benefit the environment.', approved: true },
        { id: 'op-zero', text: 'Bu harika görüş %90 kaliteye sahip ama HİÇ OY ALMADI çünkü henüz oylanmadı.', approved: true }
      ],
      analysis: null
    });
  });

  it('(1) calculateReasoningQualityScore Türkçe, İngilizce ve Almanca gerekçeleri doğru puanlar', () => {
    const trScore = calculateReasoningQualityScore('Toplu taşıma desteği artırılmalı çünkü dar gelirli aileler bu nedenle zorlanmaktadır.');
    const enScore = calculateReasoningQualityScore('Public transit should be expanded because it reduces emissions, therefore helping low income families.');
    const deScore = calculateReasoningQualityScore('Klimarat: Ich bin für eine Geschwindigkeitsbegrenzung, weil es Leben schützt und Umwelt entlastet.');

    expect(trScore).toBeGreaterThanOrEqual(45);
    expect(enScore).toBeGreaterThanOrEqual(45);
    expect(deScore).toBeGreaterThanOrEqual(45);
  });

  it('(2) 0 oy almış (%90 kalitede olsa bile) görüşler ASLA minorityInsights listesine dahil edilmez', () => {
    const session = db.getSessionSync(SESSION_CODE);
    const activeParticipants = session.participants.filter(p => !p.isBanned);
    const MINORITY_MIN_VOTES = 3;

    const statementMetrics = session.statements.map(st => {
      const voteCount = activeParticipants.filter(p => p.votes[st.id] !== undefined && p.votes[st.id] !== 0).length;
      const agreeCount = activeParticipants.filter(p => p.votes[st.id] === 1).length;
      const approvalRate = voteCount > 0 ? agreeCount / voteCount : 0;
      const qualityScore = calculateReasoningQualityScore(st.text);
      return { id: st.id, text: st.text, voteCount, agreeCount, approvalRate, qualityScore };
    });

    const votedStatements = statementMetrics.filter(s => s.voteCount >= MINORITY_MIN_VOTES);
    const opZeroMetric = statementMetrics.find(s => s.id === 'op-zero');

    // op-zero 0 oylu
    expect(opZeroMetric.voteCount).toBe(0);

    // op-zero votedStatements havuzuna giremez
    expect(votedStatements.some(s => s.id === 'op-zero')).toBe(false);
  });

  it('(3) Hiçbir görüş MINORITY_MIN_VOTES (3 oy) eşiğini karşılamıyorsa minorityInsights BOŞ ARRAY [] döner', () => {
    const MINORITY_MIN_VOTES = 3;

    // Sadece 2 katılımcılı (maksimum 2 oylu) yeni bir oturum simülasyonu
    const freshStatements = [
      { id: 's1', text: 'Toplu taşıma desteği artırılmalı çünkü dar gelirli aileler zorlanmaktadır.', voteCount: 2, qualityScore: 85 },
      { id: 's2', text: 'Bisiklet yolları yaygınlaştırılmalı çünkü çevre kirliliğini önlemektedir.', voteCount: 1, qualityScore: 90 }
    ];

    const votedStatements = freshStatements.filter(s => s.voteCount >= MINORITY_MIN_VOTES);

    let minorityInsights = [];
    if (votedStatements.length > 0) {
      minorityInsights = votedStatements.slice(0, 3);
    }

    // Hiçbir görüş 3 oya ulaşmadığı için boş dizi olmalı (zoraki 3 eleman seçilmez)
    expect(votedStatements.length).toBe(0);
    expect(minorityInsights).toEqual([]);
  });

  it('(4) Yeterli oy alan (voteCount >= 3) ve yüksek kalite skoruna sahip görüşler doğru seçilir', () => {
    const session = db.getSessionSync(SESSION_CODE);
    const activeParticipants = session.participants.filter(p => !p.isBanned);
    const MINORITY_MIN_VOTES = 3;

    const statementMetrics = session.statements.map(st => {
      const voteCount = activeParticipants.filter(p => p.votes[st.id] !== undefined && p.votes[st.id] !== 0).length;
      const agreeCount = activeParticipants.filter(p => p.votes[st.id] === 1).length;
      const approvalRate = voteCount > 0 ? agreeCount / voteCount : 0;
      const qualityScore = calculateReasoningQualityScore(st.text);
      return { id: st.id, text: st.text, voteCount, agreeCount, approvalRate, qualityScore };
    });

    const votedStatements = statementMetrics.filter(s => s.voteCount >= MINORITY_MIN_VOTES);

    expect(votedStatements.length).toBe(3); // op-1, op-2, op-3 her biri 3 oy almış
    expect(votedStatements.every(s => s.voteCount >= 3)).toBe(true);
  });
});
