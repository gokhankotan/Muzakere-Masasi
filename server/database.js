import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { invalidateLlmCacheForSession, setInLlmCache, generateHash } from './services/llm.service.js';

class Database {
  constructor() {
    this.prisma = new PrismaClient();
    this.isPrismaActive = false;
    this.sessions = new Map(); // code -> session object
    this.admins = new Map();   // email -> admin object (In-Memory admin deposu)
    this.adminActions = [];    // Yöneticilerin son değişiklikleri günlüğü
    this.sessionVersions = new Map();     // code -> mutation version number (Req 1)
    this.sessionLastMutated = new Map();  // code -> timestamp ms (Req 1)
    this.nextStatementId = 1;
    this.initialized = this.init();
  }

  markSessionMutated(sessionCode, mutationType = 'general') {
    if (!sessionCode) return { version: 1, lastMutatedAt: Date.now() };
    const code = sessionCode.toUpperCase();
    const currentVersion = (this.sessionVersions.get(code) || 1) + 1;
    const now = Date.now();
    this.sessionVersions.set(code, currentVersion);
    this.sessionLastMutated.set(code, now);

    const session = this.sessions.get(code);
    if (session) {
      session.version = currentVersion;
      session.lastMutatedAt = now;

      if (mutationType === 'vote') {
        session.pendingVotes = (session.pendingVotes || 0) + 1;
        session.pendingMutationCount = (session.pendingMutationCount || 0) + 1;
      } else if (mutationType === 'opinion') {
        session.pendingOpinions = (session.pendingOpinions || 0) + 1;
        session.pendingMutationCount = (session.pendingMutationCount || 0) + 1;
      }
    }

    // Explicitly invalidate LLM cache for mutated session (Req 3)
    invalidateLlmCacheForSession(code);

    console.log(`🔄 [SESSION MUTATED] Session ${code} (${mutationType}) -> Version: v${currentVersion}, MutatedAt: ${new Date(now).toLocaleTimeString()}`);
    return { version: currentVersion, lastMutatedAt: now };
  }

  resetPendingMutations(sessionCode) {
    if (!sessionCode) return;
    const code = sessionCode.toUpperCase();
    const session = this.sessions.get(code);
    if (session) {
      session.pendingMutationCount = 0;
      session.pendingVotes = 0;
      session.pendingOpinions = 0;
    }
  }

  // ─── DIRTY CAMPS TRACKING (Kısmi/Artımlı Küme Özeti Üretimi) ─────────────
  markCampDirty(sessionCode, campId) {
    if (!sessionCode || campId === undefined || campId === null) return;
    const code = sessionCode.toUpperCase();
    const session = this.sessions.get(code);
    if (session) {
      const numericId = Number(campId);
      const k = session.targetK || 3;
      if (numericId >= k) return; // Geçersiz kamp ID'lerini yok say

      if (!session.dirtyCampTimestamps) session.dirtyCampTimestamps = new Map();
      if (!session.dirtyCamps) session.dirtyCamps = new Set();
      
      const now = Date.now();
      session.dirtyCampTimestamps.set(numericId, now);
      session.dirtyCamps.add(numericId);
    }
  }

  markAllCampsDirty(sessionCode) {
    if (!sessionCode) return;
    const code = sessionCode.toUpperCase();
    const session = this.sessions.get(code);
    if (session) {
      const k = session.targetK || 3;
      const now = Date.now();
      if (!session.dirtyCampTimestamps) session.dirtyCampTimestamps = new Map();
      if (!session.dirtyCamps) session.dirtyCamps = new Set();
      
      session.dirtyCampTimestamps.clear();
      session.dirtyCamps.clear();
      for (let i = 0; i < k; i++) {
        session.dirtyCampTimestamps.set(i, now);
        session.dirtyCamps.add(i);
      }
    }
  }

  getDirtyCamps(sessionCode) {
    if (!sessionCode) return new Set();
    const code = sessionCode.toUpperCase();
    const session = this.sessions.get(code);
    return session?.dirtyCamps ? new Set(session.dirtyCamps) : new Set();
  }

  clearDirtyCamps(sessionCode, campIds, snapshotTime = null) {
    if (!sessionCode) return;
    const code = sessionCode.toUpperCase();
    const session = this.sessions.get(code);
    if (session) {
      const idsToClear = Array.isArray(campIds)
        ? campIds
        : (campIds instanceof Set ? Array.from(campIds) : []);

      idsToClear.forEach(id => {
        const numericId = Number(id);
        const lastDirtyTime = session.dirtyCampTimestamps?.get(numericId) || 0;
        
        // Snapshot zamanı verilmişse: Eğer snapshot sonrası kampa YENİ bir mutasyon gelmediyse temizle.
        // Eğer LLM çağrısı sürerken kampa yeni mutasyon geldiyse (lastDirtyTime > snapshotTime) SİLME!
        if (snapshotTime === null || lastDirtyTime <= snapshotTime) {
          session.dirtyCampTimestamps?.delete(numericId);
          session.dirtyCamps?.delete(numericId);
        }
      });
    }
  }

  getSessionMutationInfo(sessionCode) {
    const code = (sessionCode || 'DEFAULT').toUpperCase();
    const session = this.sessions.get(code);
    return {
      version: this.sessionVersions.get(code) || (session ? session.version : 1) || 1,
      lastMutatedAt: this.sessionLastMutated.get(code) || (session ? session.lastMutatedAt : Date.now()) || Date.now()
    };
  }

  logAdminAction(code, action, details, adminName = 'Yönetici') {
    this.adminActions.unshift({
      timestamp: new Date().toISOString(),
      code: code || 'Sistem',
      action,
      details,
      adminName
    });
    if (this.adminActions.length > 50) {
      this.adminActions.pop();
    }
  }

  getAdminActions() {
    return this.adminActions || [];
  }

  async init() {
    try {
      // Veritabanı bağlantısını test et
      await this.prisma.$connect();
      this.isPrismaActive = true;
      console.log('PostgreSQL Prisma veritabanı bağlantısı başarılı.');

      // Mevcut oturumları yükle
      await this.loadSessionsFromDB();

      // Veritabanından master admin'i kontrol et, yoksa oluştur
      await this.ensureMasterAdmin();
    } catch (error) {
      this.isPrismaActive = false;
      console.warn('Veritabanı bağlantısı kurulamadı. Çevrimdışı/Bellek-İçi (In-Memory) moda geçiliyor:', error.message);

      // Çevrimdışı modda master admin'i bellek içinde oluştur
      await this.createMasterAdminInMemory();

      // Varsayılan oturumu bellek içinde oluştur
      this.createSessionSync({
        code: 'DEFAULT',
        title: 'Varsayılan Masa',
        description: 'Varsayılan müzakere masası',
        question: 'Şehir içi ulaşımda mikromobiliteyi (bisiklet, e-scooter) artırmak için motorlu araç şeritleri ve otopark alanları daraltılmalı mıdır?',
        visibility: 'PUBLIC'
      });
    }
  }

  // ==================== ADMIN YÖNETİMİ ====================

  /**
   * Master admin kullanıcısını bellek içinde oluşturur.
   * Sunucu her başladığında çevrimdışı modda çağrılır.
   */
  async createMasterAdminInMemory() {
    const email = 'admin@muzakere.local';
    const username = 'admin';
    const password = 'admin123';
    const passwordHash = await bcrypt.hash(password, 12);

    const admin = {
      id: 'master-admin-001',
      email,
      username,
      passwordHash,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.admins.set(email, admin);
    console.log(`✅ Master admin oluşturuldu: ${email} (username: admin, şifre: admin123)`);
    return admin;
  }

  /**
   * Prisma aktifken veritabanında master admin'in varlığını kontrol eder.
   * Yoksa oluşturur ve bellek içi depoya da ekler.
   */
  async ensureMasterAdmin() {
    const email = 'admin@muzakere.local';
    const username = 'admin';
    const password = 'admin123';

    try {
      let admin = await this.prisma.admin.findUnique({ where: { email } });

      if (!admin) {
        const passwordHash = await bcrypt.hash(password, 12);
        admin = await this.prisma.admin.create({
          data: { email, username, passwordHash }
        });
        console.log(`✅ Veritabanında master admin oluşturuldu: ${email}`);
      } else {
        console.log(`✅ Veritabanında master admin mevcut: ${email}`);
      }

      // Bellek içi depoya da ekle
      this.admins.set(admin.email, admin);
    } catch (err) {
      console.error('Master admin kontrol/oluşturma hatası:', err.message);
      // Yedek olarak bellek içinde oluştur
      await this.createMasterAdminInMemory();
    }
  }

  /**
   * Yeni admin kullanıcısı oluşturur (hem bellek hem veritabanı).
   */
  async createAdmin(email, username, password) {
    const passwordHash = await bcrypt.hash(password, 12);
    const id = `admin-${Math.random().toString(36).substring(2, 9)}`;

    const admin = {
      id,
      email,
      username,
      passwordHash,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Bellek içi depoya ekle
    this.admins.set(email, admin);

    // Veritabanına da yaz
    if (this.isPrismaActive) {
      try {
        const dbAdmin = await this.prisma.admin.upsert({
          where: { email },
          update: { passwordHash, username },
          create: { email, username, passwordHash }
        });
        admin.id = dbAdmin.id;
        this.admins.set(email, admin);
      } catch (err) {
        console.error('Admin DB oluşturma hatası:', err.message);
      }
    }

    console.log(`✅ Yeni admin oluşturuldu: ${email}`);
    return admin;
  }

  /**
   * E-posta adresine göre admin arar (önce bellek, sonra veritabanı).
   */
  async findAdminByEmail(email) {
    // Önce bellek içi depoya bak
    if (this.admins.has(email)) {
      return this.admins.get(email);
    }

    // Veritabanından ara
    if (this.isPrismaActive) {
      try {
        const admin = await this.prisma.admin.findUnique({ where: { email } });
        if (admin) {
          this.admins.set(admin.email, admin);
          return admin;
        }
      } catch (err) {
        console.error('Admin DB arama hatası:', err.message);
      }
    }

    return null;
  }

  /**
   * Kullanıcı adına göre admin arar (önce bellek, sonra veritabanı).
   */
  async findAdminByUsername(username) {
    for (const admin of this.admins.values()) {
      if (admin.username === username) {
        return admin;
      }
    }

    if (this.isPrismaActive) {
      try {
        const admin = await this.prisma.admin.findUnique({ where: { username } });
        if (admin) {
          this.admins.set(admin.email, admin);
          return admin;
        }
      } catch (err) {
        console.error('Admin DB arama hatası (username):', err.message);
      }
    }

    return null;
  }

  /**
   * Tüm admin kullanıcılarını listeler.
   */
  async listAdmins() {
    if (this.isPrismaActive) {
      try {
        const dbAdmins = await this.prisma.admin.findMany({
          select: { id: true, email: true, createdAt: true }
        });
        return dbAdmins;
      } catch (err) {
        console.error('Admin listeleme hatası:', err.message);
      }
    }

    // Bellek içi listeyi döndür
    return Array.from(this.admins.values()).map(a => ({
      id: a.id,
      email: a.email,
      createdAt: a.createdAt
    }));
  }

  async loadSessionsFromDB() {
    try {
      const dbSessions = await this.prisma.session.findMany({
        include: {
          opinions: true,
          participants: {
            include: {
              votes: true
            }
          }
        }
      });

      for (const dbSession of dbSessions) {
        if (dbSession.code === 'DEFAULT' && !dbSession.creatorId) {
          const firstAdmin = await this.prisma.admin.findFirst();
          if (firstAdmin) {
            await this.prisma.session.update({
              where: { code: 'DEFAULT' },
              data: { creatorId: firstAdmin.id }
            });
            dbSession.creatorId = firstAdmin.id;
          }
        }
        const statements = dbSession.opinions.filter(o => o.status === 'APPROVED').map(o => ({
          id: o.id,
          text: o.text,
          author: o.author,
          timestamp: o.timestamp,
          approved: true,
          aiWarning: o.aiWarning,
          aiWarningFlag: o.aiWarningFlag
        }));

        const moderationQueue = dbSession.opinions.filter(o => o.status === 'PENDING').map(o => ({
          id: o.id,
          text: o.text,
          author: o.author,
          timestamp: o.timestamp,
          approved: false,
          aiWarning: o.aiWarning,
          aiWarningFlag: o.aiWarningFlag
        }));

        const participants = dbSession.participants.map(p => {
          const votes = {};
          p.votes.forEach(v => {
            votes[v.opinionId] = v.value;
          });
          return {
            id: p.id,
            nickname: p.nickname,
            justification: p.justification || '',
            isBot: p.isBot,
            isBanned: p.isBanned || false,
            votes,
            joinedAt: p.joinedAt
          };
        });

        // Analiz alanı JSON tipindedir
        let analysis = {
          points: [],
          camps: [],
          bridges: [],
          polarisability: null
        };
        if (dbSession.analysis) {
          analysis = typeof dbSession.analysis === 'string' 
            ? JSON.parse(dbSession.analysis) 
            : dbSession.analysis;
        }

        const session = {
          id: dbSession.id,
          code: dbSession.code,
          title: dbSession.title,
          description: dbSession.description,
          question: dbSession.question,
          status: dbSession.status,
          visibility: dbSession.visibility,
          passwordHash: dbSession.passwordHash,
          passwordText: dbSession.passwordText,
          passwordUpdatedAt: dbSession.passwordUpdatedAt,
          statements,
          moderationQueue,
          participants,
          analysis,
          creatorId: dbSession.creatorId,
          createdAt: dbSession.createdAt,
          updatedAt: dbSession.updatedAt
        };

        this.sessions.set(dbSession.code, session);
      }

      console.log(`📂 Veritabanından yüklenen aktif oturum kodları:`, Array.from(this.sessions.keys()));

      // Eğer DB boş ise varsayılan oturumu oluştur
      if (this.sessions.size === 0) {
        let adminId = null;
        if (this.isPrismaActive) {
          const admin = await this.prisma.admin.findFirst();
          if (admin) adminId = admin.id;
        }
        this.createSessionSync({
          code: 'DEFAULT',
          title: 'Varsayılan Masa',
          description: 'Varsayılan müzakere masası',
          question: 'Şehir içi ulaşımda mikromobiliteyi (bisiklet, e-scooter) artırmak için motorlu araç şeritleri ve otopark alanları daraltılmalı mıdır?',
          visibility: 'PUBLIC',
          creatorId: adminId
        });
      }
    } catch (err) {
      console.error('Veritabanından oturum yüklenirken hata:', err.message);
    }
  }

  // Geriye dönük uyumluluk için varsayılan session'ı döndürür
  get session() {
    if (!this.sessions.has('DEFAULT')) {
      this.createSessionSync({
        code: 'DEFAULT',
        title: 'Varsayılan Masa',
        description: 'Varsayılan müzakere masası',
        question: 'Şehir içi ulaşımda mikromobiliteyi (bisiklet, e-scooter) artırmak için motorlu araç şeritleri ve otopark alanları daraltılmalı mıdır?',
        visibility: 'PUBLIC'
      });
    }
    return this.sessions.get('DEFAULT');
  }

  getSessionSync(code) {
    return this.sessions.get(code) || null;
  }

  async getSessionByCode(code) {
    await this.initialized;
    return this.sessions.get(code) || null;
  }

  createSessionSync({ code, title, description, question, visibility, passwordHash = null, passwordText = null, creatorId = null, skipDefaultStatements = false }) {
    const sessionCode = code ? code.toUpperCase() : Math.random().toString(36).substring(2, 8).toUpperCase();
    
    const session = {
      id: `session-${Math.random().toString(36).substring(2, 9)}`,
      code: sessionCode,
      title: title || 'Müzakere Masası',
      description: description || '',
      question: question || '',
      status: 'active',
      visibility: visibility || 'PUBLIC',
      passwordHash: passwordHash,
      passwordText: passwordText,
      passwordUpdatedAt: passwordHash ? new Date() : null,
      statements: [],
      moderationQueue: [],
      participants: [],
      analysis: {
        points: [],
        camps: [],
        bridges: [],
        polarisability: null
      },
      targetK: 3,
      customCampNames: {},
      polarizationHistory: [],
      creatorId: creatorId,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.sessions.set(sessionCode, session);
    this.logAdminAction(sessionCode, 'CREATE_SESSION', `Oturum kuruldu: ${session.title}`);

    // Veritabanına asenkron yaz
    if (this.isPrismaActive) {
      this.prisma.session.create({
        data: {
          id: session.id,
          code: session.code,
          title: session.title,
          description: session.description,
          question: session.question,
          visibility: session.visibility,
          passwordHash: session.passwordHash,
          passwordText: session.passwordText,
          passwordUpdatedAt: session.passwordUpdatedAt,
          creatorId: session.creatorId,
          opinions: {
            create: session.statements.map(s => ({
              id: s.id,
              text: s.text,
              author: s.author,
              status: 'APPROVED',
              timestamp: s.timestamp
            }))
          }
        }
      }).catch(err => {
        console.error('Veritabanına oturum eklenirken hata oluştu:', err.message);
      });
    }

    return session;
  }

  addParticipant(sessionCode, nickname, justification = '') {
    const session = this.sessions.get(sessionCode);
    if (!session) throw new Error('Oturum bulunamadı.');

    const normNickname = (nickname || '').trim();
    const existing = session.participants.find(p => p.nickname.toLowerCase() === normNickname.toLowerCase());
    if (existing) {
      if (existing.isBanned) {
        throw new Error('Bu kullanıcı bu oturumdan engellenmiştir.');
      } else {
        throw new Error('Bu rumuz zaten kullanılıyor.');
      }
    }

    const id = `p-${Math.random().toString(36).substring(2, 9)}`;
    const participant = {
      id,
      nickname: normNickname || `Katılımcı_${id.substring(2, 6)}`,
      justification: justification.trim(),
      votes: {}, // { [statementId]: 1 | -1 | 0 }
      isBot: false,
      isBanned: false,
      joinedAt: new Date()
    };

    session.participants.push(participant);

    if (this.isPrismaActive) {
      this.prisma.participant.create({
        data: {
          id: participant.id,
          nickname: participant.nickname,
          justification: participant.justification,
          isBot: participant.isBot,
          isBanned: participant.isBanned,
          sessionId: session.id
        }
      }).catch(err => {
        console.error('Participant DB ekleme hatası:', err.message);
      });
    }

    return participant;
  }

  removeParticipant(sessionCode, participantId) {
    const session = this.sessions.get(sessionCode);
    if (!session) return false;
    const idx = session.participants.findIndex(p => p.id === participantId);
    if (idx === -1) return false;
    session.participants.splice(idx, 1);
    // PostgreSQL'de katılımcıyı tutmak isteyebilirsiniz (veri saklama için).
    // Burada yalnızca in-memory listeden kaldırıyoruz.
    return true;
  }

  castVote(sessionCode, participantId, statementId, voteValue) {
    const session = this.sessions.get(sessionCode);
    if (!session) return false;

    const participant = session.participants.find(p => p.id === participantId);
    if (!participant || participant.isBanned) return false;

    if (![1, -1, 0].includes(voteValue)) return false;

    participant.votes[statementId] = voteValue;
    this.markSessionMutated(sessionCode, 'vote');

    // Oy veren katılımcının ait olduğu kampı dirty (kirli) olarak işaretle
    const point = session.analysis?.points?.find(pt => pt.id === participantId || (participant.nickname && pt.nickname === participant.nickname));
    if (point && point.campId !== undefined && point.campId !== null) {
      this.markCampDirty(sessionCode, point.campId);
    }

    if (this.isPrismaActive) {
      this.prisma.vote.upsert({
        where: {
          participantId_opinionId: {
            participantId: participant.id,
            opinionId: statementId
          }
        },
        update: { value: voteValue },
        create: {
          participantId: participant.id,
          opinionId: statementId,
          value: voteValue
        }
      }).catch(err => {
        console.error('Vote DB kaydetme hatası:', err.message);
      });
    }

    return true;
  }

  addStatement(sessionCode, text, author, approved = false, isBot = false, aiWarning = null) {
    const session = this.sessions.get(sessionCode);
    if (!session) throw new Error('Oturum bulunamadı.');

    const statement = {
      id: `s-${this.nextStatementId++}`,
      text: text.trim().substring(0, 750),
      author: author || 'Misafir',
      timestamp: new Date(),
      approved,
      isBot,
      aiWarning,
      aiWarningFlag: !!aiWarning
    };

    if (approved) {
      session.statements.push(statement);
      this.markSessionMutated(sessionCode, 'opinion');
    } else {
      session.moderationQueue.push(statement);
      this.markSessionMutated(sessionCode, 'general');
    }

    if (this.isPrismaActive) {
      this.prisma.opinion.create({
        data: {
          id: statement.id,
          text: statement.text,
          author: statement.author,
          status: approved ? 'APPROVED' : 'PENDING',
          isBot: statement.isBot,
          aiWarning: statement.aiWarning,
          aiWarningFlag: statement.aiWarningFlag,
          sessionId: session.id
        }
      }).catch(err => {
        console.error('Opinion DB ekleme hatası:', err.message);
      });
    }

    return statement;
  }

  approveStatement(sessionCode, id) {
    const session = this.sessions.get(sessionCode);
    if (!session) return null;

    const idx = session.moderationQueue.findIndex(s => s.id === id);
    if (idx !== -1) {
      const statement = session.moderationQueue.splice(idx, 1)[0];
      statement.approved = true;
      this.logAdminAction(sessionCode, 'APPROVE_OPINION', `Görüş onaylandı: "${statement.text.substring(0, 30)}..."`);
      session.statements.push(statement);
      this.markSessionMutated(sessionCode, 'opinion');

      if (this.isPrismaActive) {
        this.prisma.opinion.update({
          where: { id },
          data: { status: 'APPROVED' }
        }).catch(err => {
          console.error('Opinion DB onaylama hatası:', err.message);
        });
      }
      return statement;
    }
    return null;
  }

  rejectStatement(sessionCode, id) {
    const session = this.sessions.get(sessionCode);
    if (!session) return null;

    const idx = session.moderationQueue.findIndex(s => s.id === id);
    if (idx !== -1) {
      const statement = session.moderationQueue.splice(idx, 1)[0];
      statement.approved = false;
      this.logAdminAction(sessionCode, 'REJECT_OPINION', `Görüş reddedildi: "${statement.text.substring(0, 30)}..."`);
      this.markSessionMutated(sessionCode, 'general');

      if (this.isPrismaActive) {
        this.prisma.opinion.update({
          where: { id },
          data: { status: 'REJECTED' }
        }).catch(err => {
          console.error('Opinion DB reddetme hatası:', err.message);
        });
      }
      return statement;
    }
    return null;
  }

  updateSessionQuestion(sessionCode, newQuestion) {
    const session = this.sessions.get(sessionCode);
    if (!session) return;

    session.question = newQuestion;
    this.logAdminAction(sessionCode, 'UPDATE_QUESTION', `Soru güncellendi: ${newQuestion}`);
    this.markSessionMutated(sessionCode, 'structural');

    if (this.isPrismaActive) {
      this.prisma.session.update({
        where: { code: sessionCode },
        data: { question: newQuestion }
      }).catch(err => {
        console.error('Oturum soru güncelleme hatası:', err.message);
      });
    }
  }

  updateSessionPassword(sessionCode, passwordHash, visibility, passwordText = null) {
    const session = this.sessions.get(sessionCode);
    if (!session) return;

    session.visibility = visibility;
    session.passwordHash = passwordHash;
    session.passwordText = passwordText;
    this.logAdminAction(sessionCode, 'UPDATE_PASSWORD', `Erişim türü/şifre güncellendi: ${visibility}`);
    session.passwordUpdatedAt = new Date();

    if (this.isPrismaActive) {
      this.prisma.session.update({
        where: { code: sessionCode },
        data: {
          visibility,
          passwordHash,
          passwordText,
          passwordUpdatedAt: session.passwordUpdatedAt
        }
      }).catch(err => {
        console.error('Oturum şifre güncelleme hatası:', err.message);
      });
    }
  }

  updateSessionDetails(sessionCode, { title, description, question, status, visibility, passwordHash, passwordText }) {
    const session = this.sessions.get(sessionCode);
    if (!session) return null;

    if (title !== undefined) session.title = title;
    if (description !== undefined) session.description = description;
    if (question !== undefined) session.question = question;
    if (status !== undefined) session.status = status;
    if (visibility !== undefined) session.visibility = visibility;
    if (passwordHash !== undefined) session.passwordHash = passwordHash;
    if (passwordText !== undefined) session.passwordText = passwordText;
    session.updatedAt = new Date();
    this.logAdminAction(sessionCode, 'UPDATE_DETAILS', `Oturum ayarları güncellendi. Başlık: ${session.title}, Durum: ${session.status}, Erişim: ${session.visibility}`);

    if (this.isPrismaActive) {
      this.prisma.session.update({
        where: { code: sessionCode },
        data: {
          title: session.title,
          description: session.description,
          question: session.question,
          status: session.status,
          visibility: session.visibility,
          passwordHash: session.passwordHash,
          passwordText: session.passwordText
        }
      }).catch(err => {
        console.error('Oturum detay güncelleme hatası:', err.message);
      });
    }
    return session;
  }

  updateAnalysis(sessionCode, analysisResults) {
    const session = this.sessions.get(sessionCode);
    if (!session) return;

    session.analysis = analysisResults;

    if (this.isPrismaActive) {
      this.prisma.session.update({
        where: { code: sessionCode },
        data: { analysis: analysisResults }
      }).catch(err => {
        console.error('Oturum analiz güncelleme hatası:', err.message);
      });
    }
  }

  simulateBots(sessionCode, count = 100) {
    const session = this.sessions.get(sessionCode);
    if (!session) throw new Error('Oturum bulunamadı.');

    const profiles = {
      'Mikromobilite Taraftarı': {
        's-1': 1, 's-2': -1, 's-3': -1, 's-4': 1, 's-5': -1, 's-6': -1, 's-7': 1, 's-8': 1
      },
      'Araç Sürücüleri & Ticari Grup': {
        's-1': -1, 's-2': 1, 's-3': 1, 's-4': -1, 's-5': -1, 's-6': 1, 's-7': -1, 's-8': 0
      },
      'Yaya & Toplu Taşıma Savunucuları': {
        's-1': 0, 's-2': -1, 's-3': 1, 's-4': 1, 's-5': 1, 's-6': 1, 's-7': 1, 's-8': 1
      }
    };

    const profileKeys = Object.keys(profiles);

    for (let i = 0; i < count; i++) {
      const profileName = profileKeys[i % profileKeys.length];
      const botProfile = profiles[profileName];

      const botId = `bot-${Math.random().toString(36).substring(2, 9)}`;
      const justification = `Bu şehirde hepimiz yaşıyoruz. ${profileName} bakış açısıyla ulaşıma katkı sağlamak istiyorum.`;

      const bot = {
        id: botId,
        nickname: `${profileName.split(' ')[0]}_Bot_${Math.floor(100 + Math.random() * 900)}`,
        justification,
        votes: {},
        isBot: true,
        joinedAt: new Date()
      };

      session.statements.forEach(st => {
        const targetVote = botProfile[st.id] !== undefined ? botProfile[st.id] : 0;
        const rand = Math.random();
        if (rand < 0.85) {
          bot.votes[st.id] = targetVote;
        } else if (rand < 0.95) {
          bot.votes[st.id] = 0;
        } else {
          bot.votes[st.id] = -targetVote;
        }
      });

      // Diğer görüşlere rastgele oylar ver
      session.statements.forEach(st => {
        if (bot.votes[st.id] === undefined) {
          const rand = Math.random();
          bot.votes[st.id] = rand < 0.4 ? 1 : (rand < 0.8 ? -1 : 0);
        }
      });

      session.participants.push(bot);

      if (this.isPrismaActive) {
        this.prisma.participant.create({
          data: {
            id: bot.id,
            nickname: bot.nickname,
            justification: bot.justification,
            isBot: bot.isBot,
            sessionId: session.id
          }
        }).then(() => {
          const voteData = Object.entries(bot.votes).map(([opId, val]) => ({
            participantId: bot.id,
            opinionId: opId,
            value: val
          }));
          return this.prisma.vote.createMany({ data: voteData });
        }).catch(err => {
          console.error('Bot DB yazım hatası:', err.message);
        });
      }
    }
  }

  reset(sessionCode = 'DEFAULT') {
    const session = this.sessions.get(sessionCode);
    if (!session) return;

    session.statements = [];
    session.moderationQueue = [];
    session.participants = [];
    this.logAdminAction(sessionCode, 'RESET_SESSION', `Oturum sıfırlandı ve arşivlendi.`);
    session.analysis = {
      points: [],
      camps: [],
      bridges: [],
      polarisability: null
    };
    session.polarizationHistory = [];
    session.status = 'archived';

    if (this.isPrismaActive) {
      Promise.all([
        this.prisma.participant.deleteMany({ where: { sessionId: session.id } }),
        this.prisma.opinion.deleteMany({ where: { sessionId: session.id } }),
        this.prisma.session.update({
          where: { id: session.id },
          data: {
            status: 'archived',
            analysis: {
              points: [],
              camps: [],
              bridges: [],
              polarisability: null
            },
            polarizationHistory: []
          }
        })
      ]).catch(err => {
        console.error('Session reset DB hatası:', err.message);
      });
    }
  }

  /**
   * Oturum durumunu günceller (active, paused).
   */
  updateSessionStatus(sessionCode, status) {
    const session = this.sessions.get(sessionCode);
    if (!session) return;

    session.status = status;
    this.logAdminAction(sessionCode, 'UPDATE_STATUS', `Oturum durumu güncellendi: ${status}`);

    if (this.isPrismaActive) {
      this.prisma.session.update({
        where: { code: sessionCode },
        data: { status }
      }).catch(err => {
        console.error('Oturum durumu güncelleme hatası:', err.message);
      });
    }
    console.log(`⚖️ Oturum [${sessionCode}] durumu güncellendi: ${status}`);
  }

  /**
   * Oturum oylama matrisini CSV formatında oluşturur.
   * Format: Katilimci_ID,Rumuz,Gerekce,Tip,Kamp_ID,Harita_X,Harita_Y,Gorus_[S-1],Gorus_[S-2]...
   */
  generateCSVExport(sessionCode) {
    const session = this.sessions.get(sessionCode);
    if (!session) return '';

    const approvedOpinions = session.statements.filter(o => o.approved !== false);
    
    // CSV Başlık Satırı
    const headers = [
      'Katilimci_ID',
      'Rumuz',
      'Gerekce',
      'Tip',
      'Kamp_ID',
      'Harita_X',
      'Harita_Y',
      ...approvedOpinions.map(op => `Gorus_${op.id.replace(/-/g, '_')}("${op.text.replace(/"/g, '""').substring(0, 30)}...")`)
    ];

    const csvRows = [headers.join(',')];

    // Harita koordinatları ve kamp eşleşmeleri için analizi indeksle
    const pointsMap = new Map();
    if (session.analysis && session.analysis.points) {
      session.analysis.points.forEach(pt => {
        pointsMap.set(pt.id, pt);
      });
    }

    // Katılımcıları satır satır ekle
    session.participants.filter(p => !p.isBanned).forEach(p => {
      const ptInfo = pointsMap.get(p.id) || { campId: 0, x: 0, y: 0 };
      
      const rowData = [
        p.id,
        `"${p.nickname.replace(/"/g, '""')}"`,
        `"${(p.justification || '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`,
        p.isBot ? 'Bot' : 'Gerçek',
        ptInfo.campId,
        ptInfo.x,
        ptInfo.y
      ];

      // Her bir görüş için oyu ekle
      approvedOpinions.forEach(op => {
        const vote = p.votes[op.id];
        // Oy değeri yoksa 0 (Nötr / Kararsız) yazılır.
        rowData.push(vote !== undefined ? vote : 0);
      });

      csvRows.push(rowData.join(','));
    });

    return csvRows.join('\n');
  }

  /**
   * Bir katılımcıyı oturumdan çıkarır (engeller).
   * Veritabanı ve bellek içi oylarını temizler.
   */
  kickParticipant(sessionCode, participantId) {
    const session = this.sessions.get(sessionCode);
    if (!session) return false;

    const participant = session.participants.find(p => p.id === participantId);
    if (!participant || participant.isBanned) return false;

    // 1. Katılımcıyı banlı olarak işaretle (silme)
    participant.isBanned = true;
    this.logAdminAction(sessionCode, 'KICK_PARTICIPANT', `Katılımcı engellendi: "${participant.nickname}"`);

    // 2. Katılımcının kendi verdiği oyları RAM'den temizle
    participant.votes = {};

    // 3. Katılımcının PENDING durumdaki görüşlerini sil
    session.moderationQueue = session.moderationQueue.filter(o => o.author !== participant.nickname);

    // 4. Prisma/PostgreSQL güncellemeleri
    if (this.isPrismaActive) {
      // Katılımcıyı güncelle
      this.prisma.participant.update({
        where: { id: participantId },
        data: { isBanned: true }
      }).catch(err => {
        console.error('Participant DB ban güncelleme hatası:', err.message);
      });

      // PENDING görüşleri sil
      this.prisma.opinion.deleteMany({
        where: { author: participant.nickname, sessionId: session.id, status: 'PENDING' }
      }).catch(err => {
        console.error('Pending opinions DB silme hatası:', err.message);
      });

      // Oyları sil
      this.prisma.vote.deleteMany({
        where: { participantId: participantId }
      }).catch(err => {
        console.error('Votes DB silme hatası:', err.message);
      });
    }

    console.log(`❌ Katılımcı [${participantId}] oturumdan [${sessionCode}] engellendi (Banned).`);
    return true;
  }

  /**
   * Oturum için hedef fikir kampı sayısını (targetK) günceller.
   */
  updateSessionCampsCount(sessionCode, k) {
    const session = this.sessions.get(sessionCode);
    if (!session) return false;
    
    const targetK = parseInt(k, 10);
    if (isNaN(targetK) || targetK < 2 || targetK > 5) return false;

    session.targetK = targetK;
    this.logAdminAction(sessionCode, 'UPDATE_CAMPS_COUNT', `Hedef kamp sayısı değiştirildi: ${targetK}`);
    this.markSessionMutated(sessionCode, 'structural');

    // K değeri azaltıldığında var olmayan eski kamp ID'lerini temizle
    if (session.dirtyCampTimestamps) {
      for (const campId of Array.from(session.dirtyCampTimestamps.keys())) {
        if (campId >= targetK) {
          session.dirtyCampTimestamps.delete(campId);
        }
      }
    }
    if (session.dirtyCamps) {
      for (const campId of Array.from(session.dirtyCamps)) {
        if (campId >= targetK) {
          session.dirtyCamps.delete(campId);
        }
      }
    }

    if (session.analysis) {
      if (Array.isArray(session.analysis.camps)) {
        session.analysis.camps = session.analysis.camps.filter(c => c.id < targetK);
      }
      if (session.analysis.campApprovalRates) {
        Object.keys(session.analysis.campApprovalRates).forEach(campId => {
          if (Number(campId) >= targetK) {
            delete session.analysis.campApprovalRates[campId];
          }
        });
      }
    }

    if (session.customCampNames) {
      Object.keys(session.customCampNames).forEach(campId => {
        if (Number(campId) >= targetK) {
          delete session.customCampNames[campId];
        }
      });
    }

    // 0..(targetK-1) aralığındaki geçerli kampları kirli say
    this.markAllCampsDirty(sessionCode);

    if (this.isPrismaActive) {
      this.prisma.session.update({
        where: { code: sessionCode },
        data: { targetK }
      }).catch(err => console.error('targetK DB güncelleme hatası:', err.message));
    }
    return true;
  }

  /**
   * Belirli bir kamp ID'si için özel bir isim kaydeder.
   */
  renameSessionCamp(sessionCode, campId, newName) {
    const session = this.sessions.get(sessionCode);
    if (!session) return false;

    if (!session.customCampNames) {
      session.customCampNames = {};
    }
    session.customCampNames[campId] = newName.trim();
    this.logAdminAction(sessionCode, 'RENAME_CAMP', `Fikir kampı [${campId}] yeniden adlandırıldı: "${newName.trim()}"`);
    this.markSessionMutated(sessionCode, 'structural');

    if (this.isPrismaActive) {
      this.prisma.session.update({
        where: { code: sessionCode },
        data: { customCampNames: session.customCampNames }
      }).catch(err => console.error('customCampNames DB güncelleme hatası:', err.message));
    }
    return true;
  }

  /**
   * Oturumun kutuplaşma trend geçmişine yeni bir veri ekler.
   * Throttle: son kayıttan bu yana en az 90 saniye geçmeli VEYA değer >2% değişmeli.
   * Limit: 100 kayıt (FIFO dairesel tampon).
   */
  addPolarizationHistoryEntry(sessionCode, value, participantCount = 0, triggerReason = 'mutation', isSimulated = false) {
    const session = this.sessions.get(sessionCode);
    if (!session) return false;

    if (!session.polarizationHistory) {
      session.polarizationHistory = [];
    }

    const now = Date.now();
    const newVal = parseFloat(value);
    const simulatedFlag = Boolean(isSimulated);

    // Throttle: çok sık kayıt birikmesini önle
    if (session.polarizationHistory.length > 0) {
      const last = session.polarizationHistory[session.polarizationHistory.length - 1];
      const timeSinceLastSec = Math.round((now - last.t) / 1000);
      const valueDelta = Math.abs(newVal - last.v).toFixed(1);
      // Son kayıttan bu yana 90 saniyeden az geçmiş VE değer 2%'den az değişmişse atla
      if (now - last.t < 90 * 1000 && parseFloat(valueDelta) < 2) {
        console.log(`⏭️ [POLARIZATION SKIP${simulatedFlag ? ' — SİMÜLASYON' : ''}] Oturum ${sessionCode} — son kayıttan ${timeSinceLastSec}s geçti, değişim %${valueDelta} — eşik altında, atlandı`);
        return false;
      }
    }

    const entry = {
      t: now,
      v: newVal,
      n: participantCount,
      isSimulated: simulatedFlag
    };

    // Circular buffer (FIFO): Maksimum 100 kayıt saklanır. 100'e ulaşıldığında en eski kayıt silinir.
    while (session.polarizationHistory.length >= 100) {
      session.polarizationHistory.shift();
    }
    session.polarizationHistory.push(entry);

    const logTag = simulatedFlag ? ' 📊 [POLARIZATION LOG — SİMÜLASYON]' : '📊 [POLARIZATION LOG]';
    console.log(`${logTag} Oturum ${sessionCode} — tetikleyici: ${triggerReason} — kutuplaşma: %${newVal.toFixed(1)} — throttle: geçti`);

    if (this.isPrismaActive) {
      this.prisma.session.update({
        where: { code: sessionCode },
        data: { polarizationHistory: session.polarizationHistory }
      }).catch(err => console.error('polarizationHistory DB güncelleme hatası:', err.message));
    }
    return true;
  }
}

export const db = new Database();
export default db;
