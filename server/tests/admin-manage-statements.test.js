import { describe, it, expect, beforeEach } from 'vitest';
import db from '../database.js';

describe('Admin Edit and Delete Opinions Verification', () => {
  const TEST_SESSION_CODE = 'EDITTEST';

  beforeEach(async () => {
    await db.initialized;

    db.sessions.set(TEST_SESSION_CODE, {
      code: TEST_SESSION_CODE,
      title: 'Admin Management Test',
      question: 'Test Question?',
      visibility: 'PUBLIC',
      status: 'active',
      statements: [
        { id: 'st-edit-1', text: 'İlk Metin 1', approved: true, status: 'APPROVED' },
        { id: 'st-edit-2', text: 'İlk Metin 2', approved: true, status: 'APPROVED' }
      ],
      participants: [],
      moderationQueue: [],
      analysis: null
    });
  });

  it('Görüşün metni database seviyesinde güncellenebilmelidir', () => {
    const session = db.getSessionSync(TEST_SESSION_CODE);
    expect(session.statements[0].text).toBe('İlk Metin 1');

    const updated = db.editStatementText(TEST_SESSION_CODE, 'st-edit-1', 'Guncellenmis Metin');
    expect(updated).not.toBeNull();
    expect(updated.text).toBe('Guncellenmis Metin');

    const updatedSession = db.getSessionSync(TEST_SESSION_CODE);
    expect(updatedSession.statements[0].text).toBe('Guncellenmis Metin');
  });

  it('Görüş database seviyesinde silinebilmelidir', () => {
    const session = db.getSessionSync(TEST_SESSION_CODE);
    expect(session.statements.length).toBe(2);

    const success = db.deleteStatement(TEST_SESSION_CODE, 'st-edit-2');
    expect(success).toBe(true);

    const updatedSession = db.getSessionSync(TEST_SESSION_CODE);
    expect(updatedSession.statements.length).toBe(1);
    expect(updatedSession.statements.find(s => s.id === 'st-edit-2')).toBeUndefined();
  });
});
