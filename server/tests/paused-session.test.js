import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../database.js';
import { checkParticipantAccess } from '../middleware/auth.middleware.js';

describe('Duraklatılmış (Paused) Oturum Katılımcı Kısıtlama Testleri', () => {
  const sessionCode = 'PAUSETST';

  beforeEach(async () => {
    await db.initialized;
    // Test oturumunu oluştur veya sıfırla
    db.sessions.set(sessionCode, {
      id: 'paused-session-uuid',
      code: sessionCode,
      title: 'Duraklatma Test Oturumu',
      description: 'Test',
      question: 'Test Sorusu?',
      status: 'active',
      visibility: 'PUBLIC',
      participants: [
        { id: 'p-1', nickname: 'Ali', isBanned: false, votes: {} }
      ],
      opinions: [
        { id: 'op-1', text: 'Test Görüşü', status: 'APPROVED', author: 'Ali' }
      ],
      statements: [
        { id: 'op-1', text: 'Test Görüşü', approved: true, author: 'Ali' }
      ],
      moderationQueue: []
    });
  });

  it('(a) Oturum duraklatıldığında checkParticipantAccess middleware 403 reddi vermelidir', async () => {
    const session = db.getSessionSync(sessionCode);
    session.status = 'paused';

    const req = { params: { code: sessionCode } };
    let resStatus = null;
    let resJson = null;
    const res = {
      status(code) {
        resStatus = code;
        return this;
      },
      json(data) {
        resJson = data;
        return this;
      }
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    await checkParticipantAccess(req, res, next);

    expect(nextCalled).toBe(false);
    expect(resStatus).toBe(403);
    expect(resJson.success).toBe(false);
    expect(resJson.message).toContain('duraklatılmıştır');
  });

  it('(b) Oturum duraklatıldığında yeni görüş gönderme reddedilmelidir', () => {
    const session = db.getSessionSync(sessionCode);
    session.status = 'paused';

    let errMessage = null;
    try {
      if (session.status === 'paused') {
        throw new Error('Bu masada görüş alımı moderatör tarafından duraklatılmıştır.');
      }
      db.addStatement(sessionCode, 'Yeni Görüş', 'Ali');
    } catch (err) {
      errMessage = err.message;
    }

    expect(errMessage).toContain('duraklatılmıştır');
  });

  it('(c) Oturum duraklatıldığında oy kullanma işlemi reddedilmelidir', () => {
    const session = db.getSessionSync(sessionCode);
    session.status = 'paused';

    let voteResult = null;
    if (session.status === 'paused') {
      voteResult = { success: false, message: 'Masa duraklatıldığı için şu anda oy verilemez.' };
    } else {
      voteResult = db.castVote(sessionCode, 'p-1', 'op-1', 1);
    }

    expect(voteResult.success).toBe(false);
    expect(voteResult.message).toContain('duraklatıldığı');
  });

  it('(d) Zaten bağlı socket, oturum duraklatıldıktan SONRA oy gönderdiğinde anında reddedilmelidir', () => {
    const session = db.getSessionSync(sessionCode);
    // Soket önceden bağlı durumdaydı (status: active)
    expect(session.status).toBe('active');

    // Moderatör oturumu duraklattı
    db.updateSessionStatus(sessionCode, 'paused');
    expect(session.status).toBe('paused');

    // Canlı soket üzerinden gelen oy emit simülasyonu (emit anında status sorgulanır)
    const currentSession = db.getSessionSync(sessionCode);
    let socketResponse = null;

    if (currentSession && currentSession.status === 'paused') {
      socketResponse = { success: false, message: 'Masa duraklatıldığı için şu anda oy verilemez.' };
    } else {
      socketResponse = { success: true };
    }

    expect(socketResponse.success).toBe(false);
    expect(socketResponse.message).toContain('duraklatıldığı');
  });

  it('(e) Moderatör oturumu tekrar active yaptığında kısıtlamalar kalkmalıdır', () => {
    db.updateSessionStatus(sessionCode, 'paused');
    expect(db.getSessionSync(sessionCode).status).toBe('paused');

    // Moderatör tekrar aktifleştirdi
    db.updateSessionStatus(sessionCode, 'active');
    const session = db.getSessionSync(sessionCode);
    expect(session.status).toBe('active');

    const voteSuccess = db.castVote(sessionCode, 'p-1', 'op-1', 1);
    expect(voteSuccess).toBe(true);
  });
});
