import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../database.js';

describe('Anlamlı Değişim Eşiği ve Çift Sayım Önleme Testleri', () => {
  const TEST_CODE = 'THRESH_TST';

  beforeEach(() => {
    db.reset(TEST_CODE);
    db.createSessionSync({
      code: TEST_CODE,
      title: 'Eşik ve Çift Sayım Test Masası',
      question: 'Test sorusu',
      visibility: 'PUBLIC'
    });
    db.resetPendingMutations(TEST_CODE);
  });

  it('(1) Henüz onaylanmamış bir görüş addStatement ile gönderildiğinde pendingOpinions ARTMAZ (0 kalır)', () => {
    const session = db.getSessionSync(TEST_CODE);
    expect(session.pendingOpinions || 0).toBe(0);

    const st = db.addStatement(TEST_CODE, 'Test görüşü pending', 'Katılımcı A', false);
    expect(st.approved).toBe(false);

    // Henüz onaylanmadığı için sayacın 0 kaldığını doğrula
    expect(session.pendingOpinions || 0).toBe(0);
    expect(session.pendingMutationCount || 0).toBe(0);
  });

  it('(2) Gönderilen görüş approveStatement ile onaylandığında pendingOpinions SADECE BU NOKTADA +1 artar', () => {
    const session = db.getSessionSync(TEST_CODE);
    const st = db.addStatement(TEST_CODE, 'Test görüşü onay bekleyen', 'Katılımcı B', false);
    expect(session.pendingOpinions || 0).toBe(0);

    const approvedSt = db.approveStatement(TEST_CODE, st.id);
    expect(approvedSt).not.toBeNull();
    expect(approvedSt.approved).toBe(true);

    // Sadece onaylandığında +1 arttığını doğrula
    expect(session.pendingOpinions).toBe(1);
    expect(session.pendingMutationCount).toBe(1);
  });

  it('(3) Görüş rejectStatement ile reddedildiğinde pendingOpinions ARTMAZ (0 kalır)', () => {
    const session = db.getSessionSync(TEST_CODE);
    const st = db.addStatement(TEST_CODE, 'Test görüşü reddedilecek', 'Katılımcı C', false);
    expect(session.pendingOpinions || 0).toBe(0);

    const rejectedSt = db.rejectStatement(TEST_CODE, st.id);
    expect(rejectedSt).not.toBeNull();
    expect(rejectedSt.approved).toBe(false);

    // Reddedilen görüş analize girmeyeceği için sayacın artmadığını doğrula
    expect(session.pendingOpinions || 0).toBe(0);
    expect(session.pendingMutationCount || 0).toBe(0);
  });

  it('(4) Oy kullanıldığında (castVote) pendingVotes +1 artar', () => {
    const session = db.getSessionSync(TEST_CODE);
    const participantId = 'p-test-01';
    session.participants.push({
      id: participantId,
      nickname: 'Oycu',
      votes: {}
    });

    const success = db.castVote(TEST_CODE, participantId, 's-1', 1);
    expect(success).toBe(true);

    expect(session.pendingVotes).toBe(1);
    expect(session.pendingMutationCount).toBe(1);
  });
});
