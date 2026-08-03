import { describe, it, expect, beforeEach } from 'vitest';
import db from '../database.js';

describe('LiveScreen Enriched Statements & Metrics Verification', () => {
  const TEST_SESSION_CODE = 'LIVETEST';

  beforeEach(async () => {
    await db.initialized;
    
    // Create or reset session LIVETEST
    db.sessions.set(TEST_SESSION_CODE, {
      code: TEST_SESSION_CODE,
      title: 'Live Screen Enriched Test',
      question: 'Test Question for Live Screen?',
      visibility: 'PUBLIC',
      status: 'active',
      statements: [
        { id: 'st-1', text: 'Görüş 1', approved: true, status: 'APPROVED' },
        { id: 'st-2', text: 'Görüş 2', approved: true, status: 'APPROVED' },
        { id: 'st-3', text: 'Görüş 3', approved: true, status: 'APPROVED' }
      ],
      participants: [
        { id: 'p1', nickname: 'User1', votes: { 'st-1': 1, 'st-2': -1, 'st-3': 1 } },
        { id: 'p2', nickname: 'User2', votes: { 'st-1': 1, 'st-2': 1, 'st-3': -1 } },
        { id: 'p3', nickname: 'User3', votes: { 'st-1': 1, 'st-2': 1, 'st-3': 1 } }
      ],
      moderationQueue: [],
      analysis: null
    });
  });

  it('(1) getEnrichedStatements raw görüşleri oy sayıları ve onay oranlarıyla doğru şekilde zenginleştirir', () => {
    const session = db.getSessionSync(TEST_SESSION_CODE);
    const activeParticipants = session.participants.filter(p => !p.isBanned);

    const enriched = session.statements.map(st => {
      const voteCount = activeParticipants.filter(p => p.votes && p.votes[st.id] !== undefined && p.votes[st.id] !== 0).length;
      const agreeCount = activeParticipants.filter(p => p.votes && p.votes[st.id] === 1).length;
      const disagreeCount = activeParticipants.filter(p => p.votes && p.votes[st.id] === -1).length;
      const passCount = activeParticipants.filter(p => p.votes && p.votes[st.id] === 0).length;
      const approvalRate = voteCount > 0 ? Math.round((agreeCount / voteCount) * 100) : 0;
      return { ...st, voteCount, agreeCount, disagreeCount, passCount, approvalRate };
    });

    expect(enriched.length).toBe(3);

    // st-1: 3 katılımcı katıldı -> voteCount = 3, agreeCount = 3 -> approvalRate = 100%
    const st1 = enriched.find(s => s.id === 'st-1');
    expect(st1.voteCount).toBe(3);
    expect(st1.agreeCount).toBe(3);
    expect(st1.approvalRate).toBe(100);

    // st-2: 3 katılımcı -> p1 = -1, p2 = 1, p3 = 1 -> voteCount = 3, agreeCount = 2 -> approvalRate = 67%
    const st2 = enriched.find(s => s.id === 'st-2');
    expect(st2.voteCount).toBe(3);
    expect(st2.agreeCount).toBe(2);
    expect(st2.disagreeCount).toBe(1);
    expect(st2.approvalRate).toBe(67);
  });

  it('(2) LiveScreen modal liste veri eşleme (metricsMap) mantığı doğru oy ve onay oranını üretir', () => {
    const session = db.getSessionSync(TEST_SESSION_CODE);
    const activeParticipants = session.participants.filter(p => !p.isBanned);

    const statementMetrics = session.statements.map(st => {
      const voteCount = activeParticipants.filter(p => p.votes && p.votes[st.id] !== undefined && p.votes[st.id] !== 0).length;
      const agreeCount = activeParticipants.filter(p => p.votes && p.votes[st.id] === 1).length;
      const disagreeCount = activeParticipants.filter(p => p.votes && p.votes[st.id] === -1).length;
      const passCount = activeParticipants.filter(p => p.votes && p.votes[st.id] === 0).length;
      const approvalRate = voteCount > 0 ? Math.round((agreeCount / voteCount) * 100) : 0;
      return { ...st, voteCount, agreeCount, disagreeCount, passCount, approvalRate };
    });

    const mockAnalysis = { allStatements: statementMetrics };
    const metricsMap = new Map((mockAnalysis.allStatements || []).map(s => [s.id, s]));

    const mappedResults = session.statements.map(st => {
      const metric = metricsMap.get(st.id) || st;
      const voteCount = metric.voteCount !== undefined ? metric.voteCount : ((metric.agreeCount || 0) + (metric.disagreeCount || 0) + (metric.passCount || 0));
      const agreeCount = metric.agreeCount || 0;
      const approvalPct = metric.approvalRate !== undefined ? metric.approvalRate : (voteCount > 0 ? Math.round((agreeCount / Math.max(1, voteCount)) * 100) : 0);
      return { id: st.id, voteCount, agreeCount, approvalPct };
    });

    expect(mappedResults[0].voteCount).toBe(3);
    expect(mappedResults[0].approvalPct).toBe(100);
    expect(mappedResults[1].voteCount).toBe(3);
    expect(mappedResults[1].approvalPct).toBe(67);
  });
});
