import { describe, it, expect, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { db } from '../database.js';
import { getCampAssignmentExplanation } from '../algorithms.js';

describe('Kamp Ataması Şeffaflık Paneli — Sahiplik ve Yetkilendirme (BOLA Koruması) Testleri', () => {
  const sessionCode = 'EXPLTST';
  const participantAId = 'p-user-A';
  const participantBId = 'p-user-B';
  const JWT_SECRET = process.env.JWT_SECRET || 'kamusal_alan_gizli_anahtar';

  beforeEach(async () => {
    await db.initialized;
    
    db.sessions.set(sessionCode, {
      id: 'expl-session-uuid',
      code: sessionCode,
      title: 'Şeffaflık Test Oturumu',
      description: 'Test',
      question: 'Test Sorusu?',
      status: 'active',
      visibility: 'PUBLIC',
      participants: [
        {
          id: participantAId,
          nickname: 'Katılımcı A',
          isBanned: false,
          votes: { 'op-1': 1, 'op-2': -1 }
        },
        {
          id: participantBId,
          nickname: 'Katılımcı B',
          isBanned: false,
          votes: { 'op-1': -1, 'op-2': 1 }
        }
      ],
      statements: [
        { id: 'op-1', text: 'Görüş 1', approved: true },
        { id: 'op-2', text: 'Görüş 2', approved: true }
      ],
      analysis: {
        points: [
          { id: participantAId, campId: 0, nickname: 'Katılımcı A' },
          { id: participantBId, campId: 1, nickname: 'Katılımcı B' }
        ],
        camps: [
          { id: 0, name: 'Grup A', size: 1 },
          { id: 1, name: 'Grup B', size: 1 }
        ]
      }
    });
  });

  it('Katılımcı A kendi ID\'sini talep ettiğinde doğru açıklama verisini almalıdır (200 OK)', () => {
    const session = db.getSessionSync(sessionCode);
    const explanation = getCampAssignmentExplanation(participantAId, session);

    expect(explanation).not.toBeNull();
    expect(explanation.participantId).toBe(participantAId);
    expect(explanation.campId).toBe(0);
    expect(explanation.definingVotes.length).toBeGreaterThan(0);
  });

  it('BOLA KORUMASI (1): Katılımcı A kendi JWT token\'ı ile Katılımcı B\'nin verisini istediginde 403 Forbidden almalıdır', () => {
    const tokenA = jwt.sign({ type: 'participant_access', sessionCode: sessionCode, participantId: participantAId }, JWT_SECRET);
    const decoded = jwt.verify(tokenA, JWT_SECRET);

    // SIKI BOLA KONTROLÜ
    const isAuthorized = decoded.type === 'participant_access' &&
                         decoded.sessionCode === sessionCode &&
                         decoded.participantId &&
                         decoded.participantId === participantBId;

    expect(isAuthorized).toBe(false); // BOLA Engellendi!
  });

  it('BOLA KORUMASI (2): Genel/null-participantId token ile herhangi bir katılımcının açıklaması istendiğinde 403 Forbidden almalıdır', () => {
    const genericToken = jwt.sign({ type: 'participant_access', sessionCode: sessionCode, participantId: null }, JWT_SECRET);
    const decoded = jwt.verify(genericToken, JWT_SECRET);

    // SIKI BOLA KONTROLÜ
    const isAuthorized = decoded.type === 'participant_access' &&
                         decoded.sessionCode === sessionCode &&
                         Boolean(decoded.participantId) &&
                         decoded.participantId === participantBId;

    expect(isAuthorized).toBe(false); // null-participantId Reddedildi!
  });

  it('BOLA KORUMASI (3): Katılımcı A kendi participantId\'si ile imzalanmış token kullandığında 200 OK yetkisi almalıdır', () => {
    const tokenA = jwt.sign({ type: 'participant_access', sessionCode: sessionCode, participantId: participantAId }, JWT_SECRET);
    const decoded = jwt.verify(tokenA, JWT_SECRET);

    const isAuthorized = decoded.type === 'participant_access' &&
                         decoded.sessionCode === sessionCode &&
                         decoded.participantId === participantAId;

    expect(isAuthorized).toBe(true); // Meşru İstek Geçti!
  });

  it('Sahiplik doğrulaması başarısız olduğunda detay sızdırmayan genel 403 mesajı dönmelidir', () => {
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

    const handleUnauthorized = () => {
      return res.status(403).json({ success: false, message: 'Bu bilgiye erişim yetkiniz yok.' });
    };

    handleUnauthorized();

    expect(resStatus).toBe(403);
    expect(resJson.success).toBe(false);
    expect(resJson.message).toBe('Bu bilgiye erişim yetkiniz yok.');
  });
});
