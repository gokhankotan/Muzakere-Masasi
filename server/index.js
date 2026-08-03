/**
 * Müzakere Masası - Express & Socket.io Sunucusu
 * Gerçek zamanlı senkronizasyon, API uç noktaları, LLM entegrasyonu ve çoklu oturum desteği sağlar.
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

import { db } from './database.js';
import { calculatePCA, runKMeansWithStability, analyzeCampsAndBridges, alignCentroids, calculatePolarisability, calculateKMeans, getCampAssignmentExplanation } from './algorithms.js';
import { authenticateAdmin, passwordRateLimiter, checkParticipantAccess, checkModerator, verifySessionToken, requireSessionOwnership, isSessionOwner } from './middleware/auth.middleware.js';
import { generateClusterSummary, generateAllClusterSummaries, evaluateOpinionContent, generateAxisLabel, generateAxisLabels, generatePolarizationImpactDescription, discoverConsensusPotential, generateExecutiveSummary, sanitizeLLMResponse, generateFallbackSummary, generateAxisFallbackSummary, generateRuleBasedConsensusFallback, getLlmQuotaStatus, resetRpdQuotaStatus } from './services/llm.service.js';
import { calculateReasoningQualityScore } from './services/quality.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || 'kamusal_alan_gizli_anahtar';

// Yapılandırılabilir mutasyon eşik değerleri (PROJECT_CONSTRAINTS & Rate Limit Koruması)
const MUTATION_THRESHOLD_VOTES = parseInt(process.env.MUTATION_THRESHOLD_VOTES || '5', 10);
const MUTATION_THRESHOLD_OPINIONS = parseInt(process.env.MUTATION_THRESHOLD_OPINIONS || '2', 10);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// API: Giriş ve Rapor Çıktısı

app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Kullanıcı adı ve şifre gereklidir.' });
  }

  try {
    await db.initialized; // Veritabanı/admin başlatılmasının tamamlanmasını bekle

    const admin = await db.findAdminByUsername(username);

    if (!admin) {
      return res.status(401).json({ success: false, message: 'Geçersiz kullanıcı adı veya şifre.' });
    }

    const isMatch = await bcrypt.compare(password, admin.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Geçersiz kullanıcı adı veya şifre.' });
    }

    const token = jwt.sign({ 
      type: 'admin', 
      email: admin.email, 
      username: admin.username,
      id: admin.id || 'offline-admin-id' 
    }, JWT_SECRET, { expiresIn: '24h' });

    res.json({ success: true, token });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 1.2 Admin Oturumları Meta-Analiz Endpoint'i
app.get('/api/admin/sessions-overview', authenticateAdmin, async (req, res) => {
  try {
    let overview = [];
    if (db.isPrismaActive) {
      const dbSessions = await db.prisma.session.findMany({
        where: {
          status: { not: 'archived' }
        },
        include: {
          opinions: true,
          participants: true
        }
      });

      overview = dbSessions.map(session => {
        const analysisObj = session.analysis;
        const polarisability = (analysisObj && typeof analysisObj === 'object') ? analysisObj.polarisability : null;

        return {
          code: session.code,
          title: session.title,
          description: session.description || '',
          question: session.question || '',
          status: session.status,
          visibility: session.visibility,
          passwordText: session.passwordText,
          participantsCount: session.participants.filter(p => !p.isBanned).length,
          statementsCount: session.opinions.filter(o => o.status === 'APPROVED').length,
          polarisability
        };
      });
    } else {
      overview = Array.from(db.sessions.values())
        .filter(s => s.status !== 'archived')
        .map(s => ({
          code: s.code,
          title: s.title,
          description: s.description || '',
          question: s.question || '',
          status: s.status,
          visibility: s.visibility,
          passwordText: s.passwordText,
          participantsCount: s.participants.filter(p => !p.isBanned).length,
          statementsCount: s.statements.length,
          polarisability: s.analysis ? s.analysis.polarisability : null
        }));
    }

    res.json({ success: true, overview });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 1.2.5 Admin Değişiklik Günlüğü Endpoint'i
app.get('/api/admin/action-log', authenticateAdmin, (req, res) => {
  try {
    const logs = db.getAdminActions();
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 1.3 Admin Oturum Düzenleme API'si
app.patch('/api/admin/sessions/:code', authenticateAdmin, async (req, res) => {
  const { code } = req.params;
  const { title, description, question, status, visibility, password } = req.body;
  const upperCode = code.toUpperCase();

  try {
    const session = db.getSessionSync(upperCode);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Oturum bulunamadı.' });
    }

    let newPasswordHash = session.passwordHash;
    let newPasswordText = session.passwordText;
    if (visibility === 'PASSWORD_PROTECTED' && password) {
      newPasswordHash = await bcrypt.hash(password, 12);
      newPasswordText = password;
    } else if (visibility === 'PUBLIC') {
      newPasswordHash = null;
      newPasswordText = null;
    }

    const updated = db.updateSessionDetails(upperCode, {
      title,
      description,
      question,
      status,
      visibility,
      passwordHash: newPasswordHash,
      passwordText: newPasswordText
    });

    // Socket.io ile odadaki herkese güncellemeleri duyur
    io.to(`session-${upperCode}`).emit('session-settings-updated', { visibility, passwordText: newPasswordText });
    io.to(`session-${upperCode}`).emit('question-updated', question);
    io.to(`session-${upperCode}`).emit('session-status-updated', { status });
    io.to(`moderator-${upperCode}`).emit('session-status-updated', { status });

    res.json({ success: true, message: 'Oturum başarıyla güncellendi.', session: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. Admin Oturum Oluşturma
app.post('/api/sessions', authenticateAdmin, async (req, res) => {
  const { title, description, question } = req.body;
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  const sessionPassword = 'PASS-' + Math.random().toString(36).substring(2, 8).toUpperCase();

  try {
    const passwordHash = await bcrypt.hash(sessionPassword, 12);

    const session = db.createSessionSync({
      code,
      title,
      description,
      question,
      visibility: 'PASSWORD_PROTECTED',
      passwordHash,
      passwordText: sessionPassword,
      creatorId: req.admin.id
    });

    res.status(201).json({ success: true, code: session.code, password: sessionPassword, session });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Herkese Açık / Şifreli Oturum Oluşturma & Yerleşik Moderatörlük
app.post('/api/sessions/create', async (req, res) => {
  const { title, description, question, nickname } = req.body;
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  const sessionPassword = 'PASS-' + Math.random().toString(36).substring(2, 8).toUpperCase();

  try {
    const passwordHash = await bcrypt.hash(sessionPassword, 12);

    // Oturumu oluştur
    const session = db.createSessionSync({
      code,
      title,
      description,
      question,
      visibility: 'PASSWORD_PROTECTED',
      passwordHash,
      passwordText: sessionPassword,
      creatorId: null
    });

    // Oluşturan kullanıcıyı ilk katılımcı ve moderatör yapalım
    const creatorNickname = nickname || 'Moderatör';
    const participant = db.addParticipant(code, creatorNickname, 'Masayı kuran moderatör.');

    // 24 saat geçerli moderatör token'ı
    const moderatorToken = jwt.sign({
      type: 'moderator',
      sessionCode: code,
      nickname: creatorNickname,
      participantId: participant.id
    }, JWT_SECRET, { expiresIn: '24h' });

    res.status(201).json({
      success: true,
      code,
      password: sessionPassword,
      moderatorToken,
      participant,
      session
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. Şifreli Oturuma Giriş / Token Alma
app.post('/api/sessions/:code/join', passwordRateLimiter, async (req, res) => {
  const { code } = req.params;
  const { password } = req.body;
  const upperCode = code.toUpperCase();

  try {
    const session = await db.getSessionByCode(upperCode);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Oturum bulunamadı.' });
    }

    if (session.status === 'archived') {
      return res.status(403).json({ success: false, message: 'Bu oturum artık aktif değil.' });
    }

    if (session.status === 'paused') {
      return res.status(403).json({ success: false, message: 'Bu oturum duraklatıldı.', sessionPaused: true });
    }

    if (session.visibility === 'PUBLIC') {
      const accessToken = jwt.sign({ type: 'participant_access', sessionCode: upperCode, participantId: req.body?.participantId || null }, JWT_SECRET, { expiresIn: '24h' });
      return res.json({ success: true, accessToken });
    }

    if (!password) {
      return res.status(400).json({ success: false, message: 'Bu masa şifrelidir. Şifre girmelisiniz.' });
    }

    if (!session.passwordHash) {
      return res.status(500).json({ success: false, message: 'Bu oturumun şifre yapılandırması hatalı (şifre ayarlanmamış).' });
    }

    const isMatch = await bcrypt.compare(password, session.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Hatalı şifre.' });
    }

    const accessToken = jwt.sign({ type: 'participant_access', sessionCode: upperCode, participantId: req.body?.participantId || null }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, accessToken });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Oturum Ayarları (Şifre ve Görünürlük Değiştirme)
app.patch('/api/sessions/:code/password', requireSessionOwnership, async (req, res) => {
  const { code } = req.params;
  const { password, visibility } = req.body;
  const upperCode = code.toUpperCase();

  try {
    const session = req.session;

    let newPasswordHash = session.passwordHash;
    let newPasswordText = session.passwordText;
    if (visibility === 'PASSWORD_PROTECTED' && password) {
      newPasswordHash = await bcrypt.hash(password, 12);
      newPasswordText = password;
    } else if (visibility === 'PUBLIC') {
      newPasswordHash = null;
      newPasswordText = null;
    }

    db.updateSessionPassword(upperCode, newPasswordHash, visibility, newPasswordText);
    io.to(`session-${upperCode}`).emit('session-settings-updated', { visibility, passwordText: newPasswordText });

    res.json({ success: true, message: 'Oturum erişim ayarları başarıyla güncellendi.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5.2 Oturum Durumu Değiştirme (Durdurma/Başlatma - Oversight)
app.patch('/api/sessions/:code/status', async (req, res) => {
  const { code } = req.params;
  const { status } = req.body; // active veya paused
  const authHeader = req.headers.authorization;
  const upperCode = code.toUpperCase();

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Yetkilendirme token\'ı bulunamadı.' });
  }

  const token = authHeader.split(' ')[1];
  const authResult = verifySessionToken(token, upperCode);
  if (!authResult.isValid) {
    return res.status(401).json({ success: false, message: authResult.message || 'Geçersiz token.' });
  }

  // Check: must be either any Admin or the owner moderator of this session
  let authorized = false;
  if (authResult.type === 'admin') {
    authorized = true;
  } else if (authResult.type === 'moderator') {
    authorized = true;
  }

  if (!authorized) {
    return res.status(403).json({ success: false, message: 'Bu işlem için yetkiniz yok.' });
  }

  try {
    const session = await db.getSessionByCode(upperCode);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Oturum bulunamadı.' });
    }

    db.updateSessionStatus(upperCode, status);
    io.to(`session-${upperCode}`).emit('session-status-updated', { status });
    io.to(`moderator-${upperCode}`).emit('session-status-updated', { status });

    res.json({ success: true, message: `Oturum durumu ${status} olarak güncellendi.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. Görüş Gönderme (HTTP API)
app.post('/api/sessions/:code/opinion', checkParticipantAccess, async (req, res) => {
  const { code } = req.params;
  const { text, author, isBot } = req.body;
  const upperCode = code.toUpperCase();

  if (!text) {
    return res.status(400).json({ success: false, message: 'Görüş metni gereklidir.' });
  }

  try {
    const session = db.getSessionSync(upperCode);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Oturum bulunamadı.' });
    }

    // Kullanıcı banlıysa görüş eklemeyi engelle
    const participant = session.participants.find(p => p.nickname.toLowerCase() === (author || '').trim().toLowerCase());
    if (participant && participant.isBanned) {
      return res.status(403).json({ success: false, message: 'Bu kullanıcı bu oturumdan engellenmiştir.' });
    }

    // Oturum duraklatılmışsa görüş eklemeyi engelle
    if (session.status === 'paused') {
      return res.status(400).json({ success: false, message: 'Bu masada görüş alımı moderatör tarafından duraklatılmıştır.' });
    }

    // Yapay zeka veya kural motoruyla görüş içeriğini denetle
    const aiResult = await evaluateOpinionContent(text, session.question);
    
    // AI uyarı bayrağı gerekçesi (varsa)
    const aiWarning = aiResult.flagged ? aiResult.reason : null;

    const statement = db.addStatement(upperCode, text, author, false, !!isBot, aiWarning);
    
    // Moderatör odasına kuyruk güncellemesi gönder
    io.to(`moderator-${upperCode}`).emit('moderation-queue', session.moderationQueue);

    res.status(201).json({ success: true, message: 'Görüşünüz moderasyon kuyruğuna alındı.', statement });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.patch('/api/sessions/:code/opinions/:id/status', requireSessionOwnership, async (req, res) => {
  const { code, id } = req.params;
  const { status } = req.body; // APPROVED veya REJECTED
  const upperCode = code.toUpperCase();

  try {
    const session = req.session;

    let statement = null;
    if (status === 'APPROVED') {
      statement = db.approveStatement(upperCode, id);
    } else if (status === 'REJECTED') {
      statement = db.rejectStatement(upperCode, id);
    } else {
      return res.status(400).json({ success: false, message: 'Geçersiz statü değeri.' });
    }

    if (!statement) {
      return res.status(404).json({ success: false, message: 'Görüş bulunamadı veya zaten işlendi.' });
    }

    // Moderatörlere güncel kuyruğu gönder
    io.to(`moderator-${upperCode}`).emit('moderation-queue', session.moderationQueue);

    if (status === 'APPROVED') {
      // Tüm odaya yeni oylanabilir görüşü bildir
      io.to(`session-${upperCode}`).emit('new-statement', statement);
      // Analizi tetikle
      runAndBroadcastAnalysis(upperCode, 'approveStatement');
    }

    // Canlı oylama güncellemesi için yayın
    io.to(`session-${upperCode}`).emit('opinion_moderated', { id, status, statement });

    // AI Moderasyon doğruluğunu güncelle
    sendAiAccuracyToRoom(upperCode);

    res.json({ success: true, statement });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 8. Sonuç Raporu (JSON)
app.get('/api/sessions/:code/report', checkParticipantAccess, async (req, res) => {
  const { code } = req.params;
  const upperCode = code.toUpperCase();

  try {
    const session = await db.getSessionByCode(upperCode);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Oturum bulunamadı.' });
    }

    const activeParticipants = session.participants.filter(p => !p.isBanned);
    const statements = session.statements;
    const n = activeParticipants.length;
    const m = statements.length;

    let polarizationImpacts = [];
    if (n >= 10 && m >= 5) {
      // Create unique signature based on active participants, statements count, total votes, and statement IDs
      const totalVotesCount = activeParticipants.reduce((sum, p) => sum + Object.keys(p.votes || {}).length, 0);
      const statementsHash = statements.map(s => s.id).sort().join('-');
      const currentSignature = `${n}_${m}_${totalVotesCount}_${statementsHash}`;

      if (session.polarizationImpactCache && session.polarizationImpactCache.signature === currentSignature) {
        console.log(`[Report Cache HIT] Oturum ${upperCode} için kutuplaşma etki analizi önbellekten alındı (Hesaplama atlandı).`);
        polarizationImpacts = session.polarizationImpactCache.polarizationImpacts;
      } else {
        console.log(`[Report Cache MISS] Oturum ${upperCode} için kutuplaşma etki analizi yeniden hesaplanıyor...`);
        // 1. Calculate actual polarization score
        const X_full = activeParticipants.map(p => statements.map(st => p.votes[st.id] !== undefined ? p.votes[st.id] : null));
        const pcaFull = calculatePCA(X_full, 2);
        const scoresFull = pcaFull.scores;
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        scoresFull.forEach(pt => {
          if (pt[0] < minX) minX = pt[0];
          if (pt[0] > maxX) maxX = pt[0];
          if (pt[1] < minY) minY = pt[1];
          if (pt[1] > maxY) maxY = pt[1];
        });
        const rangeX = maxX - minX;
        const rangeY = maxY - minY;
        const coordsFull = activeParticipants.map((p, i) => {
          let xCoord = 0;
          let yCoord = 0;
          if (rangeX > 1e-5) xCoord = ((scoresFull[i][0] - minX) / rangeX) * 160 - 80;
          if (rangeY > 1e-5) yCoord = ((scoresFull[i][1] - minY) / rangeY) * 160 - 80;
          return [xCoord, yCoord];
        });
        const k = Math.min(session.targetK || 3, n);
        const kmFull = runKMeansWithStability(coordsFull, k, 5);
        const pointsFull = coordsFull.map((c, i) => ({ x: c[0], y: c[1], campId: kmFull.assignments[i] }));
        const campsFull = Array(k).fill(0).map((_, cIdx) => {
          const size = pointsFull.filter(pt => pt.campId === cIdx).length;
          const c = kmFull.centroids[cIdx] || [0, 0];
          return { id: cIdx, size, x: c[0], y: c[1] };
        });
        // 1. Calculate actual polarization score on normalized [-80,+80] coords (same space as K-Means)
        const pointsFullNorm = coordsFull.map((c, i) => ({ x: c[0], y: c[1], campId: kmFull.assignments[i] }));
        const campsFullNorm = Array(k).fill(0).map((_, cIdx) => {
          const campPts = pointsFullNorm.filter(pt => pt.campId === cIdx);
          const size = campPts.length;
          const meanX = size > 0 ? campPts.reduce((sum, p) => sum + p.x, 0) / size : 0;
          const meanY = size > 0 ? campPts.reduce((sum, p) => sum + p.y, 0) / size : 0;
          return { id: cIdx, size, x: meanX, y: meanY };
        });
        const polFullNorm = calculatePolarisability(pointsFullNorm, campsFullNorm);
        const actualPolarisability = polFullNorm.polarisability !== null ? polFullNorm.polarisability : 0;

        // 2. Candidate Statement Selection (Top 15 by contrastScore across camps)
        const { campCharacteristics } = analyzeCampsAndBridges(statements, activeParticipants, kmFull.assignments, k);
        const statementContrastMap = new Map();
        
        // Calculate max contrastScore for each statement across all camps
        statements.forEach(st => {
          let maxContrast = 0;
          for (let c = 0; c < k; c++) {
            const charItem = (campCharacteristics[c] || []).find(item => item.statement.id === st.id);
            if (charItem && charItem.contrastScore > maxContrast) {
              maxContrast = charItem.contrastScore;
            }
          }
          statementContrastMap.set(st.id, maxContrast);
        });

        // Sort statements by contrastScore descending and take top 15 candidates
        const candidateStatements = [...statements]
          .sort((a, b) => (statementContrastMap.get(b.id) || 0) - (statementContrastMap.get(a.id) || 0))
          .slice(0, 15);

        // 3. Run leave-one-out sensitivity analysis asynchronously with setImmediate chunking
        const impacts = [];
        for (const targetOpinion of candidateStatements) {
          const filteredStatements = statements.filter(st => st.id !== targetOpinion.id);
          const X_filtered = activeParticipants.map(p => filteredStatements.map(st => p.votes[st.id] !== undefined ? p.votes[st.id] : null));
          const pcaFiltered = calculatePCA(X_filtered, 2);
          const scoresFiltered = pcaFiltered.scores;
          // Normalize filtered scores to [-80, +80]
          let fMinX = Infinity, fMaxX = -Infinity, fMinY = Infinity, fMaxY = -Infinity;
          scoresFiltered.forEach(pt => {
            if (pt[0] < fMinX) fMinX = pt[0];
            if (pt[0] > fMaxX) fMaxX = pt[0];
            if (pt[1] < fMinY) fMinY = pt[1];
            if (pt[1] > fMaxY) fMaxY = pt[1];
          });
          const fRangeX = fMaxX - fMinX;
          const fRangeY = fMaxY - fMinY;
          const coordsFiltered = scoresFiltered.map(pt => {
            const x = fRangeX > 1e-5 ? ((pt[0] - fMinX) / fRangeX) * 160 - 80 : 0;
            const y = fRangeY > 1e-5 ? ((pt[1] - fMinY) / fRangeY) * 160 - 80 : 0;
            return [x, y];
          });
          const kmFiltered = runKMeansWithStability(coordsFiltered, k, 5);
          const ptsFiltered = coordsFiltered.map((c, i) => ({ x: c[0], y: c[1], campId: kmFiltered.assignments[i] }));
          const campsFiltered = Array(k).fill(0).map((_, cIdx) => {
            const campPts = ptsFiltered.filter(pt => pt.campId === cIdx);
            const size = campPts.length;
            const meanX = size > 0 ? campPts.reduce((sum, p) => sum + p.x, 0) / size : 0;
            const meanY = size > 0 ? campPts.reduce((sum, p) => sum + p.y, 0) / size : 0;
            return { id: cIdx, size, x: meanX, y: meanY };
          });
          const polFiltered = calculatePolarisability(ptsFiltered, campsFiltered);
          const polarisabilityWithoutOpinion = polFiltered.polarisability !== null ? polFiltered.polarisability : 0;
          
          const impact = actualPolarisability - polarisabilityWithoutOpinion;
          const description = generatePolarizationImpactDescription(impact);
          
          impacts.push({
            opinionContent: targetOpinion.text,
            polarizationImpact: parseFloat(impact.toFixed(1)),
            description
          });

          // Yield control to Node.js event loop after each leave-one-out iteration
          await new Promise(resolve => setImmediate(resolve));
        }

        // Sort by polarizationImpact descending, take top 5
        polarizationImpacts = impacts.sort((a, b) => b.polarizationImpact - a.polarizationImpact).slice(0, 5);
        
        // Save to cache
        session.polarizationImpactCache = {
          signature: currentSignature,
          polarizationImpacts,
          calculatedAt: Date.now()
        };
      }
    }

    const execSummaryData = {
      question: session.question || '',
      participantsCount: activeParticipants.length,
      statementsCount: session.statements.length,
      campsCount: session.analysis?.camps?.length || 0,
      camps: session.analysis?.camps ? session.analysis.camps.map(c => ({ name: c.name, size: c.size, summary: c.summary })) : [],
      polarisability: session.analysis?.polarisability !== undefined ? session.analysis.polarisability : null,
      bridgesCount: session.analysis?.bridges?.length || 0,
      bridgesText: session.analysis?.bridges ? session.analysis.bridges.map(b => b.text) : [],
      participationGini: session.analysis?.participationGini,
      voteCompletionRate: session.analysis?.voteCompletionRate
    };
    const executiveSummary = await generateExecutiveSummary(execSummaryData);

    // Rapor için simülasyon kayıtlarını kutuplaşma geçmişinden tamamen filtrele
    const cleanAnalysis = session.analysis ? {
      ...session.analysis,
      polarizationHistory: (session.analysis.polarizationHistory || []).filter(pt => !pt.isSimulated)
    } : session.analysis;

    res.json({
      code: session.code,
      title: session.title,
      description: session.description,
      question: session.question,
      createdAt: session.createdAt,
      participantsCount: activeParticipants.length,
      statementsCount: session.statements.length,
      statements: session.statements,
      analysis: cleanAnalysis,
      polarizationImpacts,
      executiveSummary,
      minorityInsights: session.analysis?.minorityInsights || [],
      participants: activeParticipants.map(p => ({
        nickname: p.nickname,
        justification: p.justification,
        votesCount: Object.keys(p.votes).length,
        isBot: !!p.isBot
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Kutuplaşma Zaman Serisi Endpoint'i
app.get('/api/sessions/:code/polarization-history', checkParticipantAccess, async (req, res) => {
  const { code } = req.params;
  const upperCode = code.toUpperCase();
  try {
    const session = await db.getSessionByCode(upperCode);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Oturum bulunamadı.' });
    }
    const history = session.polarizationHistory || [];
    res.json({
      success: true,
      code: upperCode,
      history,
      currentPolarisability: session.analysis?.polarisability ?? null
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Katılımcı Kamp Ataması Açıklama Endpoint'i (Şeffaflık Paneli - Sadece JWT Sahiplik Korumalı)
app.get('/api/sessions/:code/participants/:participantId/camp-explanation', checkParticipantAccess, async (req, res) => {
  const { code, participantId } = req.params;
  const upperCode = code.toUpperCase();
  console.log(`📥 [CAMP EXPLANATION REQUEST RECEIVED] Oturum: ${upperCode}, Katılımcı: ${participantId} — ${new Date().toISOString()}`);

  try {
    const session = req.resolvedSession || await db.getSessionByCode(upperCode);
    if (!session) {
      console.warn(`⚠️ [CAMP EXPLANATION] Oturum bulunamadı: ${upperCode}`);
      return res.status(404).json({ success: false, message: 'Oturum bulunamadı.' });
    }

    let isAuthorized = false;
    let authReason = 'No Authorization Header';

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded) {
          if (decoded.type === 'admin') {
            isAuthorized = true;
            authReason = 'Admin Token';
          } else if (decoded.type === 'moderator' && decoded.sessionCode?.toUpperCase() === upperCode) {
            isAuthorized = true;
            authReason = 'Moderator Token';
          } else if (decoded.type === 'participant_access' && decoded.sessionCode?.toUpperCase() === upperCode) {
            if (decoded.participantId && decoded.participantId === participantId) {
              isAuthorized = true;
              authReason = 'Matching Participant Token';
            } else {
              authReason = `ParticipantId Mismatch (Token: ${decoded.participantId}, URL: ${participantId})`;
            }
          } else {
            authReason = `Invalid Token Type/SessionCode (Type: ${decoded.type}, Code: ${decoded.sessionCode})`;
          }
        }
      } catch (e) {
        authReason = `JWT Verification Exception: ${e.message}`;
      }
    }

    console.log(`🔒 [CAMP EXPLANATION AUTH] Authorized: ${isAuthorized} | Reason: ${authReason}`);

    if (!isAuthorized) {
      return res.status(403).json({ success: false, message: 'Bu bilgiye erişim yetkiniz yok.' });
    }

    const participant = session.participants?.find(p => p.id === participantId);
    if (!participant || participant.isBanned) {
      console.warn(`⚠️ [CAMP EXPLANATION] Katılımcı bulunamadı veya yasaklı: ${participantId}`);
      return res.status(403).json({ success: false, message: 'Bu bilgiye erişim yetkiniz yok.' });
    }

    const tStart = Date.now();
    console.log(`🧠 [CAMP EXPLANATION CALC] Calculating explanation for participant ${participantId.substring(0, 8)}…`);

    const explanation = getCampAssignmentExplanation(participantId, session);
    if (!explanation) {
      console.warn(`⚠️ [CAMP EXPLANATION] Explanation returned null for participant ${participantId.substring(0, 8)}`);
      return res.status(400).json({ success: false, message: 'Kamp ataması açıklaması için henüz yeterli analiz verisi yok.' });
    }

    const elapsed = Date.now() - tStart;
    console.log(`✅ [CAMP EXPLANATION SUCCESS] Oturum ${upperCode}, Katılımcı ${participantId.substring(0, 8)}… — Süre: ${elapsed}ms (${explanation.definingVotes?.length ?? 0} belirleyici oy)`);

    return res.json({
      success: true,
      explanation
    });
  } catch (err) {
    console.error(`❌ [CAMP EXPLANATION EXCEPTION] ${err.stack || err.message}`);
    return res.status(500).json({ success: false, message: err.message });
  }
});

const inFlightConsensusLocks = new Map();

// 8.0b. Uzlaşı Potansiyeli Keşfi (REST API)
app.post('/api/sessions/:code/discover-consensus', requireSessionOwnership, async (req, res) => {
  const { code } = req.params;
  const upperCode = code.toUpperCase();
  const ENDPOINT_TIMEOUT_MS = 15000;

  try {
    const session = await db.getSessionByCode(upperCode);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Oturum bulunamadı.' });
    }

    const analysis = session.analysis;
    if (!analysis || analysis.insufficientData || !analysis.camps || analysis.camps.length === 0) {
      return res.status(400).json({ success: false, message: 'Yeterli veri veya analiz bulunmadığından uzlaşı analizi yapılamaz.' });
    }

    const mutationInfo = db.getSessionMutationInfo(upperCode);

    // In-Flight Lock & Deduplication per session code (Requirement 3)
    if (inFlightConsensusLocks.has(upperCode)) {
      console.log(`🔒 [LLM IN-FLIGHT DEDUP] Concurrent request for session ${upperCode} detected. Joining active in-flight promise...`);
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('ENDPOINT_TIMEOUT')), ENDPOINT_TIMEOUT_MS)
        );
        const consensusPotential = await Promise.race([
          inFlightConsensusLocks.get(upperCode),
          timeoutPromise
        ]);
        const lastAnalyzedAt = analysis.lastAnalyzedAt || Date.now();
        const quotaStatus = getLlmQuotaStatus();
        return res.json({
          success: true,
          consensusPotential,
          isQuotaExhausted: quotaStatus.isRpdExhausted,
          dataFreshness: {
            isFresh: lastAnalyzedAt >= mutationInfo.lastMutatedAt,
            version: mutationInfo.version,
            lastAnalyzedAt,
            lastMutatedAt: mutationInfo.lastMutatedAt
          }
        });
      } catch (lockErr) {
        console.warn(`⚠️ [LOCK TIMEOUT/ERROR] In-flight promise for ${upperCode} failed or timed out: ${lockErr.message}. Falling back to rule-based consensus.`);
        const fallback = generateRuleBasedConsensusFallback(analysis.camps, session.question);
        const quotaStatus = getLlmQuotaStatus();
        return res.json({
          success: true,
          consensusPotential: fallback,
          isFallback: true,
          isQuotaExhausted: quotaStatus.isRpdExhausted,
          dataFreshness: { isFresh: false, version: mutationInfo.version, lastAnalyzedAt: Date.now(), lastMutatedAt: mutationInfo.lastMutatedAt }
        });
      }
    }

    const consensusPromise = (async () => {
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('ENDPOINT_TIMEOUT')), ENDPOINT_TIMEOUT_MS)
        );
        const result = await Promise.race([
          discoverConsensusPotential(analysis.camps, session.question, upperCode, mutationInfo.version),
          timeoutPromise
        ]);
        analysis.consensusPotential = result;
        analysis.lastAnalysisVersion = mutationInfo.version;
        analysis.lastAnalyzedAt = Date.now();
        db.updateAnalysis(upperCode, analysis);
        return result;
      } catch (callErr) {
        console.warn(`⚠️ [CONSENSUS TIMEOUT/ERROR] discoverConsensusPotential call for ${upperCode} failed: ${callErr.message}. Falling back to rule-based consensus.`);
        const fallback = generateRuleBasedConsensusFallback(analysis.camps, session.question);
        analysis.consensusPotential = fallback;
        analysis.lastAnalysisVersion = mutationInfo.version;
        analysis.lastAnalyzedAt = Date.now();
        db.updateAnalysis(upperCode, analysis);
        return fallback;
      } finally {
        inFlightConsensusLocks.delete(upperCode);
      }
    })();

    inFlightConsensusLocks.set(upperCode, consensusPromise);
    const consensusPotential = await consensusPromise;

    const lastAnalyzedAt = analysis.lastAnalyzedAt || Date.now();
    const isFresh = lastAnalyzedAt >= mutationInfo.lastMutatedAt;
    const quotaStatus = getLlmQuotaStatus();

    res.json({
      success: true,
      consensusPotential,
      isQuotaExhausted: quotaStatus.isRpdExhausted,
      dataFreshness: {
        isFresh,
        version: mutationInfo.version,
        lastAnalyzedAt,
        lastMutatedAt: mutationInfo.lastMutatedAt
      }
    });
  } catch (err) {
    console.error(`❌ [DISCOVER CONSENSUS ENDPOINT ERROR] ${err.message}`);
    const session = db.getSessionSync(upperCode);
    const fallback = generateRuleBasedConsensusFallback(session?.analysis?.camps, session?.question);
    const quotaStatus = getLlmQuotaStatus();
    res.json({
      success: true,
      consensusPotential: fallback,
      isFallback: true,
      isQuotaExhausted: quotaStatus.isRpdExhausted,
      message: err.message
    });
  }
});

// 8.0c. LLM Kota ve Sağlık Durumu Endpoint'i (Admin Panel Banner için)
app.get('/api/admin/llm-status', authenticateAdmin, (req, res) => {
  const status = getLlmQuotaStatus();
  res.json({
    success: true,
    status
  });
});

// 8.1. CSV İhracatı (Oylama Matrisi)
app.get('/api/sessions/:code/export/csv', checkParticipantAccess, async (req, res) => {
  const { code } = req.params;
  const upperCode = code.toUpperCase();

  try {
    const session = await db.getSessionByCode(upperCode);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Oturum bulunamadı.' });
    }

    const csvContent = db.generateCSVExport(upperCode);
    
    // Tarayıcıya dosya indirme başlıklarını set et
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=muzakere_oylama_matrisi_${upperCode}.csv`);
    
    // UTF-8 BOM ekleyerek Türkçe karakterlerin Excel'de doğru açılmasını sağlayalım
    res.send('\uFEFF' + csvContent);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Geriye dönük uyumluluk için eski rapor endpoint'i
app.get('/api/session/report', (req, res) => {
  res.redirect('/api/sessions/DEFAULT/report');
});

// Statik Dosyaları Sunma
const clientDistPath = path.join(__dirname, '../dist');
app.use(express.static(clientDistPath));

app.get('*', (req, res) => {
  if (!req.url.startsWith('/api') && !req.url.startsWith('/socket.io')) {
    res.sendFile(path.join(clientDistPath, 'index.html'), (err) => {
      if (err) {
        res.status(200).send(`
          <html>
            <head><title>Müzakere Masası</title><style>body{background:#111;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;}</style></head>
            <body>
              <div style="text-align:center;">
                <h2>Müzakere Masası Sunucusu Çalışıyor</h2>
                <p>Frontend dosyaları henüz derlenmemiş. Geliştirme modu için lütfen <code>npm run dev</code> çalıştırın.</p>
              </div>
            </body>
          </html>
        `);
      }
    });
  }
});

// Analiz Hesaplama ve Yayınlama Mantığı (Oturum Bazında Debounced)
const activeDebouncers = new Map();
const ANALYSIS_COOLDOWN = 1500; // Milisaniye

function runAndBroadcastAnalysis(sessionCode, triggerReason = 'mutation') {
  if (!activeDebouncers.has(sessionCode)) {
    activeDebouncers.set(sessionCode, { pending: false, lastRun: 0, lastReason: triggerReason });
  }
  const state = activeDebouncers.get(sessionCode);
  state.lastReason = triggerReason;
  const now = Date.now();
  const timeSinceLast = now - state.lastRun;

  if (timeSinceLast < ANALYSIS_COOLDOWN) {
    if (!state.pending) {
      state.pending = true;
      setTimeout(() => {
        state.pending = false;
        performAnalysis(sessionCode, state.lastReason);
      }, ANALYSIS_COOLDOWN - timeSinceLast);
    }
    return;
  }

  performAnalysis(sessionCode, triggerReason);
}

export async function performAnalysis(sessionCode, triggerReason = 'mutation', options = {}) {
  const session = db.getSessionSync(sessionCode);
  if (!session) return;

  const activeParticipants = session.participants.filter(p => !p.isBanned);
  const statements = session.statements;
  
  const n = activeParticipants.length;
  const m = statements.length;

  const state = activeDebouncers.get(sessionCode);
  if (state) state.lastRun = Date.now();

  // Minimum örneklem eşiği (PROJECT_CONSTRAINTS.md madde 11)
  const MIN_PARTICIPANTS = 10;
  const MIN_OPINIONS = 5;

  if (n < MIN_PARTICIPANTS || m < MIN_OPINIONS) {
    const insufficientPayload = {
      insufficientData: true,
      participantsNeeded: Math.max(0, MIN_PARTICIPANTS - n),
      opinionsNeeded: Math.max(0, MIN_OPINIONS - m),
      currentParticipants: n,
      currentOpinions: m
    };
    db.updateAnalysis(sessionCode, insufficientPayload);
    io.to(`session-${sessionCode}`).emit('analysis-update', insufficientPayload);
    return;
  }

  // ─── EŞİK KONTROLÜ (MUTATION THRESHOLD CHECK FOR LLM CALLS) ─────────────
  const pendingVotes = session.pendingVotes || 0;
  const pendingOpinions = session.pendingOpinions || 0;
  const pendingTotal = session.pendingMutationCount || 0;

  // Soru güncelleme, kamp ayarları, kick, simülasyon ve manuel tetiklemeler eşik sistemini BYPASS eder.
  const STRUCTURAL_TRIGGERS = new Set([
    'updateSessionQuestion',
    'updateSessionCampsCount',
    'renameSessionCamp',
    'kickParticipant',
    'runSimulation',
    'force',
    'manual',
    'discoverConsensus',
    'joinSession',
    'initial'
  ]);

  const isStructuralOrForce = STRUCTURAL_TRIGGERS.has(triggerReason) || options?.forceLLM === true;
  const isFirstRun = !session.analysis || !session.analysis.camps || session.analysis.camps.length === 0;

  const thresholdReached = isStructuralOrForce || isFirstRun ||
    pendingVotes >= MUTATION_THRESHOLD_VOTES ||
    pendingOpinions >= MUTATION_THRESHOLD_OPINIONS ||
    pendingTotal >= MUTATION_THRESHOLD_VOTES;

  if (thresholdReached) {
    console.log(`🎯 [THRESHOLD REACHED] Oturum ${sessionCode} — ${pendingTotal} mutasyon birikti, LLM analizi tetiklendi, sayaç sıfırlandı.`);
    db.resetPendingMutations(sessionCode);
  } else {
    console.log(`📊 [THRESHOLD] Oturum ${sessionCode} — bekleyen mutasyon: ${pendingTotal}/${MUTATION_THRESHOLD_VOTES} — LLM tetiklenmedi, matematik güncellendi.`);
  }

  // 1. Oy matrisini oluştur
  // Katılımcının oy vermediği görüşler null olarak işaretlenir (0 ile karıştırılmaz).
  // 0 = bilinçli "Geç" oyu, null = "bu görüşü hiç oylamamış" — fark kritiktir (PROJECT_CONSTRAINTS.md madde 11).
  const X = activeParticipants.map(p => {
    return statements.map(st => p.votes[st.id] !== undefined ? p.votes[st.id] : null);
  });

  // 2. PCA Koordinatlarını hesapla (null-aware NIPALS, pairwise deletion)
  const { scores, loadings, varianceExplained } = calculatePCA(X, 2);

  // 2b. PCA Eksen Yorumlanabilirliği Etiketlerini Oluştur
  const getTop3LoadingStatements = (axisIdx) => {
    if (!loadings || !loadings[axisIdx]) return [];
    const mapped = loadings[axisIdx].map((val, idx) => ({ val: Math.abs(val), idx, originalVal: val }));
    mapped.sort((a, b) => b.val - a.val);
    return mapped.slice(0, 3).map(item => ({
      statement: statements[item.idx],
      loading: item.originalVal
    }));
  };

  const top3X = getTop3LoadingStatements(0);
  const top3Y = getTop3LoadingStatements(1);

  const signatureX = top3X.map(item => item.statement?.id).filter(Boolean).sort().join('-');
  const signatureY = top3Y.map(item => item.statement?.id).filter(Boolean).sort().join('-');

  let axisLabelX = '';
  let axisLabelY = '';

  const prevAxisLabels = session.analysis?.axisLabels || {};

  if (thresholdReached) {
    if (process.env.DISABLE_LLM_CACHE !== 'true' && prevAxisLabels.signatureX === signatureX && prevAxisLabels.x) {
      const validX = sanitizeLLMResponse(prevAxisLabels.x, 'axis-label');
      if (validX) axisLabelX = validX;
    }
    if (process.env.DISABLE_LLM_CACHE !== 'true' && prevAxisLabels.signatureY === signatureY && prevAxisLabels.y) {
      const validY = sanitizeLLMResponse(prevAxisLabels.y, 'axis-label');
      if (validY) axisLabelY = validY;
    }
    if (!axisLabelX || !axisLabelY) {
      const jointLabels = await generateAxisLabels(top3X, top3Y, session.question || '');
      if (!axisLabelX) axisLabelX = jointLabels.x;
      if (!axisLabelY) axisLabelY = jointLabels.y;
    }
  } else {
    // Eşik dolmadı: LLM çağrılmıyor, önceden saklanan etiket veya kural tabanlı fallback kullanılır
    axisLabelX = prevAxisLabels.x || generateAxisFallbackSummary('x', top3X);
    axisLabelY = prevAxisLabels.y || generateAxisFallbackSummary('y', top3Y);
  }

  // Koordinatları görselleştirme için normalize et (-80 ile 80 arasına çek)
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  
  scores.forEach(pt => {
    if (pt[0] < minX) minX = pt[0];
    if (pt[0] > maxX) maxX = pt[0];
    if (pt[1] < minY) minY = pt[1];
    if (pt[1] > maxY) maxY = pt[1];
  });

  const rangeX = maxX - minX;
  const rangeY = maxY - minY;

  const points = activeParticipants.map((p, i) => {
    let xCoord = 0;
    let yCoord = 0;
    
    if (rangeX > 1e-5) xCoord = ((scores[i][0] - minX) / rangeX) * 160 - 80;
    if (rangeY > 1e-5) yCoord = ((scores[i][1] - minY) / rangeY) * 160 - 80;

    return {
      id: p.id,
      nickname: p.nickname,
      justification: p.justification || '',
      x: parseFloat(xCoord.toFixed(2)),
      y: parseFloat(yCoord.toFixed(2)),
      campId: 0, // K-Means ile doldurulacak
      isBot: !!p.isBot
    };
  });

  // 3. K-Means ile Gruba Kümele (5 çalıştırma, en iyi WCSS seçilir, clusterStability hesaplanır)
  const coordinates2D = points.map(pt => [pt.x, pt.y]);
  const k = Math.min(session.targetK || 3, n);
  const { assignments, centroids, clusterStability } = runKMeansWithStability(coordinates2D, k, 5);

  // Eski centroid'leri oku (varsa)
  let previousCentroids = [];
  if (session.analysis && session.analysis.camps) {
    previousCentroids = session.analysis.camps.map(c => [c.x, c.y]);
  }

  // Centroid Hizalama (Cluster ID Kararlılığı)
  const { assignments: alignedAssignments, centroids: alignedCentroids } = alignCentroids(centroids, assignments, previousCentroids);

  // Katılımcıların kamp atamaları değiştiyse hem eski hem yeni kampı dirty (kirli) işaretle
  const oldPointMap = new Map();
  if (session.analysis && session.analysis.points) {
    session.analysis.points.forEach(pt => oldPointMap.set(pt.id, pt.campId));
  } else {
    // İlk analiz çalıştığında tüm kampları kirli say
    db.markAllCampsDirty(sessionCode);
  }

  points.forEach((pt, idx) => {
    const newCampId = alignedAssignments[idx];
    const oldCampId = oldPointMap.get(pt.id);
    pt.campId = newCampId;

    if (oldCampId !== undefined && oldCampId !== newCampId) {
      db.markCampDirty(sessionCode, oldCampId);
      db.markCampDirty(sessionCode, newCampId);
    }
  });

  // 4. Köprü Cümleleri ve Kamp Ayırt Edici Özellikleri Analizi
  const { bridges, campCharacteristics, campApprovalRatesTable } = analyzeCampsAndBridges(statements, activeParticipants, alignedAssignments, k);

  // 5. Kampları Detaylandır (Kısmi / Artımlı Seçici Batch LLM Çağrısı ile)
  const dirtyCampSet = db.getDirtyCamps(sessionCode);

  let batchedSummaries = {};
  if (thresholdReached) {
    const draftCamps = Array(k).fill(0).map((_, cIdx) => {
      let name = `Grup ${String.fromCharCode(65 + cIdx)}`;
      if (session.customCampNames && session.customCampNames[cIdx] !== undefined) {
        name = session.customCampNames[cIdx];
      } else {
        const characteristics = campCharacteristics[cIdx] || [];
        if (characteristics.length > 0) {
          const bestText = characteristics[0].statement.text;
          const cleanWordList = bestText.split(" ").slice(0, 3).join(" ");
          name = `"${cleanWordList}..." Taraftarları`;
        }
      }
      const topStatements = (campCharacteristics[cIdx] || []).map(c => ({
        id: c.statement.id,
        text: c.statement.text,
        approvalRate: Math.round(c.approvalRate * 100),
        contrastScore: parseFloat(c.contrastScore.toFixed(2))
      }));
      const prevCamp = session.analysis?.camps?.find(c => c.id === cIdx);
      return {
        id: cIdx,
        name,
        topStatements,
        summary: prevCamp?.summary
      };
    });

    // YARIŞ DURUMU ÖNLEMİ: LLM çağrısı başlamadan önce dirty kamp ID'lerinin
    // ve anlık zaman damgasının SNAPSHOT'ını al.
    // LLM await sırasında gelen yeni mutasyonlar dirtyCamps'e eklenecek —
    // bunları temizlemekten kaçınmak için clearDirtyCamps'e snapshotTime gönderiyoruz.
    const snapshotTime = Date.now();
    const processingIds = new Set(dirtyCampSet);

    batchedSummaries = await generateAllClusterSummaries(draftCamps, session.question, sessionCode, session.version || 1, processingIds);
    
    // Sadece snapshot'taki ID'leri temizle — çağrı sırasında gelen yeni mutasyonlar korunur
    db.clearDirtyCamps(sessionCode, Array.from(processingIds), snapshotTime);
  }

  const camps = Array(k).fill(0).map((_, cIdx) => {
    const size = points.filter(pt => pt.campId === cIdx).length;
    const centroid = alignedCentroids[cIdx] || [0, 0];
    
    let name = `Grup ${String.fromCharCode(65 + cIdx)}`;
    if (session.customCampNames && session.customCampNames[cIdx] !== undefined) {
      name = session.customCampNames[cIdx];
    } else {
      const characteristics = campCharacteristics[cIdx] || [];
      if (characteristics.length > 0) {
        const bestText = characteristics[0].statement.text;
        const cleanWordList = bestText.split(" ").slice(0, 3).join(" ");
        name = `"${cleanWordList}..." Taraftarları`;
      }
    }

    const topStatements = (campCharacteristics[cIdx] || []).map(c => ({
      id: c.statement.id,
      text: c.statement.text,
      approvalRate: Math.round(c.approvalRate * 100),
      contrastScore: parseFloat(c.contrastScore.toFixed(2))
    }));

    const signature = (campCharacteristics[cIdx] || []).map(c => c.statement.id).filter(Boolean).sort().join('-');
    const prevCamp = session.analysis?.camps?.find(c => c.id === cIdx);

    let summary = '';
    if (thresholdReached) {
      summary = batchedSummaries[cIdx] || prevCamp?.summary || generateFallbackSummary(cIdx, topStatements);
    } else {
      // Eşik dolmadı: LLM çağrılmıyor, önceden saklanan özet veya kural tabanlı fallback kullanılır
      summary = prevCamp?.summary || generateFallbackSummary(cIdx, topStatements);
    }

    return {
      id: cIdx,
      name,
      size,
      x: parseFloat(centroid[0].toFixed(2)),
      y: parseFloat(centroid[1].toFixed(2)),
      topStatements,
      summary,
      signature
    };
  });

  // 5a. Aykırı Değer (Ambiguous) Tespiti
  points.forEach(pt => {
    pt.ambiguous = false;
    if (camps.length >= 2) {
      const distances = camps.map(camp => {
        const dx = pt.x - camp.x;
        const dy = pt.y - camp.y;
        return Math.sqrt(dx * dx + dy * dy);
      });
      distances.sort((a, b) => a - b);
      const d1 = distances[0];
      const d2 = distances[1];
      if (d1 > 1e-5) {
        const ratio = d2 / d1;
        if (ratio < 1.2) {
          pt.ambiguous = true;
        }
      }
    }
  });

  // 5b. Alt Kümeleme (Recursive Sub-clustering) Hesapla
  const subClustersMap = {};
  const totalParticipants = points.length;

  camps.forEach(camp => {
    const parentCampId = camp.id;
    const campPoints = points.filter(pt => pt.campId === parentCampId);
    const size = campPoints.length;

    // Kamp büyüklüğü >= toplam katılımcının %40'ı VE >= 20 katılımcı ise
    if (size >= totalParticipants * 0.40 && size >= 20) {
      const campCoords = campPoints.map(pt => [pt.x, pt.y]);
      const { assignments, centroids } = calculateKMeans(campCoords, 2);

      const subCamp0Size = assignments.filter(a => a === 0).length;
      const subCamp1Size = assignments.filter(a => a === 1).length;

      const subCentroids = [
        { id: 0, x: parseFloat(centroids[0][0].toFixed(2)), y: parseFloat(centroids[0][1].toFixed(2)), size: subCamp0Size },
        { id: 1, x: parseFloat(centroids[1][0].toFixed(2)), y: parseFloat(centroids[1][1].toFixed(2)), size: subCamp1Size }
      ];

      const participantAssignments = {};
      campPoints.forEach((pt, idx) => {
        participantAssignments[pt.id] = assignments[idx];
      });

      subClustersMap[parentCampId] = {
        centroids: subCentroids,
        assignments: participantAssignments
      };
    }
  });

  const finalSubClusters = Object.keys(subClustersMap).length > 0 ? subClustersMap : null;

  // 5c. Katılım Eşitliği (Gini Katsayısı) Hesapla
  const calculateGini = (values) => {
    const n = values.length;
    if (n === 0) return 0;
    const sum = values.reduce((acc, val) => acc + val, 0);
    if (sum === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    let tempSum = 0;
    for (let i = 0; i < n; i++) {
      tempSum += (i + 1) * sorted[i];
    }
    const gini = (2 * tempSum) / (n * sum) - (n + 1) / n;
    return parseFloat(gini.toFixed(3));
  };

  const nonBotParticipants = activeParticipants.filter(p => !p.isBot);
  const opinionCounts = nonBotParticipants.map(p => {
    return statements.filter(st => st.author === p.nickname).length;
  });
  const participationGini = calculateGini(opinionCounts);

  // 5d. Oy Tamamlama Oranı (Vote Completion Rate) Hesapla
  const totalNonBotParticipants = nonBotParticipants.length;
  const totalApprovedOpinions = statements.length;

  let totalVotesCount = 0;
  if (totalNonBotParticipants > 0 && totalApprovedOpinions > 0) {
    const approvedOpinionIds = new Set(statements.map(st => st.id));
    nonBotParticipants.forEach(p => {
      Object.keys(p.votes).forEach(opId => {
        if (approvedOpinionIds.has(opId)) {
          totalVotesCount++;
        }
      });
    });
  }

  const voteCompletionRate = (totalNonBotParticipants > 0 && totalApprovedOpinions > 0)
    ? parseFloat(((totalVotesCount / (totalNonBotParticipants * totalApprovedOpinions)) * 100).toFixed(1))
    : 0;

  // 5e. Azınlık Görüşü Tespiti (Minority Opinion Shield)
  // Az oy almış veya azınlık destekli ama güçlü gerekçeye sahip görüşleri tespit et.
  const MINORITY_MIN_VOTES = process.env.MINORITY_MIN_VOTES ? parseInt(process.env.MINORITY_MIN_VOTES, 10) : 3;
  const MINORITY_MIN_SCORE = process.env.MINORITY_MIN_SCORE ? parseInt(process.env.MINORITY_MIN_SCORE, 10) : 25;

  const statementMetrics = statements.map(st => {
    const voteCount = activeParticipants.filter(p => p.votes[st.id] !== undefined && p.votes[st.id] !== 0).length;
    const agreeCount = activeParticipants.filter(p => p.votes[st.id] === 1).length;
    const approvalRate = voteCount > 0 ? agreeCount / voteCount : 0;
    const qualityScore = calculateReasoningQualityScore(st.text);
    return { id: st.id, text: st.text, voteCount, agreeCount, approvalRate, qualityScore };
  });

  // (a) KESİN ŞART: Sadece en az MINORITY_MIN_VOTES (örn. 3) kadar oylanmış görüşler değerlendirilir
  const votedStatements = statementMetrics.filter(s => s.voteCount >= MINORITY_MIN_VOTES);

  let minorityInsights = [];

  if (votedStatements.length > 0) {
    // (b) Onay oranı <= %45 VEYA oy sayısı alt 35%'lik dilimde olan görüşler
    const sortedVoteCounts = [...votedStatements].map(s => s.voteCount).sort((a, b) => a - b);
    const p35Index = Math.max(0, Math.floor(sortedVoteCounts.length * 0.35) - 1);
    const p35Threshold = sortedVoteCounts.length > 0 ? sortedVoteCounts[p35Index] : 0;

    let candidatePool = votedStatements.filter(s =>
      s.approvalRate <= 0.45 || s.voteCount <= p35Threshold
    );

    // (c) Gerekçe kalitesi skoru >= MINORITY_MIN_SCORE olanları al
    let qualified = candidatePool.filter(s => s.qualityScore >= MINORITY_MIN_SCORE);

    // (d) Eğer (c) boş dönerse ama (b) havuzu doluysa, candidatePool içinden en yüksek gerekçe skorlu ilk 3 görüşü al
    if (qualified.length === 0 && candidatePool.length > 0) {
      qualified = [...candidatePool]
        .sort((a, b) => b.qualityScore - a.qualityScore)
        .slice(0, 3);
    }

    // (e) Eğer candidatePool da boşsa, minimum oy şartını sağlayan tüm votedStatements içinden approvalRate <= 0.60 olanları al
    if (qualified.length === 0) {
      qualified = [...votedStatements]
        .filter(s => s.approvalRate <= 0.60)
        .sort((a, b) => b.qualityScore - a.qualityScore)
        .slice(0, 3);
    }

    minorityInsights = qualified
      .sort((a, b) => b.qualityScore - a.qualityScore)
      .slice(0, 5)
      .map(s => ({
        id: s.id,
        text: s.text,
        voteCount: s.voteCount,
        agreeCount: s.agreeCount,
        approvalRate: Math.round(s.approvalRate * 100),
        qualityScore: s.qualityScore
      }));
  }

  // Kutuplaşma Derecesini (Polarisability) yeni formülle hesapla
  const polResult = calculatePolarisability(points, camps);
  const polarisability = polResult.polarisability;
  const insufficientVariance = polResult.insufficientVariance;

  const analysis = {
    points,
    camps,
    bridges: bridges.map(b => ({
      id: b.statement.id,
      text: b.statement.text,
      minApproval: Math.round(b.minApproval * 100),
      overallRate: Math.round(b.overallRate * 100),
      campApprovalRates: b.campApprovalRates.map(r => Math.round(r * 100))
    })),
    polarisability,
    insufficientVariance,
    axisLabels: { x: axisLabelX, y: axisLabelY, signatureX, signatureY },
    subClusters: finalSubClusters,
    participationGini,
    voteCompletionRate,
    targetK: session.targetK || 3,
    polarizationHistory: session.polarizationHistory || [],
    varianceExplained,
    clusterStability,
    minorityInsights,
    // ⏱ Ön-hesaplanmış kamp onay oranları — getCampAssignmentExplanation'ın sesteş döngü kullanmadan
    // hızlı lookup yapabilmesi için. Yapı: { [campId]: { [statementId]: rate } }
    campApprovalRates: campApprovalRatesTable
  };

  db.updateAnalysis(sessionCode, analysis);
  if (polarisability !== null) {
    const isSimulated = triggerReason === 'runSimulation';
    db.addPolarizationHistoryEntry(sessionCode, polarisability, activeParticipants.length, triggerReason, isSimulated);
  }
  
  // Güncel geçmişi analize tekrar yerleştir
  analysis.polarizationHistory = session.polarizationHistory || [];
  
  io.to(`session-${sessionCode}`).emit('analysis-update', analysis);
}

async function sendAiAccuracy(sessionCode, targetSocketOrIo) {
  if (!db.isPrismaActive) {
    targetSocketOrIo.emit('ai-moderation-accuracy', 0);
    return;
  }
  try {
    const session = db.getSessionSync(sessionCode);
    if (!session) return;

    const flaggedApproved = await db.prisma.opinion.count({
      where: { sessionId: session.id, aiWarningFlag: true, status: 'APPROVED' }
    });
    const flaggedRejected = await db.prisma.opinion.count({
      where: { sessionId: session.id, aiWarningFlag: true, status: 'REJECTED' }
    });
    const totalDecided = flaggedApproved + flaggedRejected;
    const accuracy = totalDecided === 0 ? 0 : Math.round((flaggedRejected / totalDecided) * 100);

    targetSocketOrIo.emit('ai-moderation-accuracy', accuracy);
  } catch (err) {
    console.error('AI Moderation Accuracy count error:', err.message);
  }
}

const sendAiAccuracyToRoom = (code) => {
  sendAiAccuracy(code, io.to(`moderator-${code}`));
};

// Socket.io Bağlantı Kontrolleri
io.on('connection', (socket) => {
  console.log(`Yeni bağlantı: ${socket.id}`);

  // Soket yetki kontrolü yardımcı fonksiyonu
  const checkSocketAuth = (sessionCode, requireOwner = false) => {
    const code = sessionCode ? sessionCode.toUpperCase() : 'DEFAULT';
    const authResult = verifySessionToken(socket.adminToken, code);
    if (!authResult.isValid || (authResult.type !== 'admin' && authResult.type !== 'moderator')) {
      socket.emit('auth-error', { message: authResult.message || 'Yetkisiz işlem.' });
      return false;
    }
    if (requireOwner) {
      const session = db.getSessionSync(code);
      if (!session || !isSessionOwner(authResult.decoded, session)) {
        socket.emit('auth-error', { message: 'Bu işlem için yetkiniz yok (sahiplik gerekir).' });
        return false;
      }
    }
    return true;
  };

  // Geriye dönük uyumluluk için varsayılan session durumunu gönder
  const defaultSession = db.session;
  socket.emit('session-state', {
    question: defaultSession.question,
    status: defaultSession.status,
    statements: defaultSession.statements,
    analysis: defaultSession.analysis,
    participantsCount: defaultSession.participants.filter(p => !p.isBanned).length
  });

  // Odaya Katılma
  socket.on('join-session', ({ sessionCode, token }, callback) => {
    const code = sessionCode ? sessionCode.toUpperCase() : 'DEFAULT';

    const session = db.getSessionSync(code);
    if (!session) {
      return callback && callback({ success: false, message: 'Oturum bulunamadı.' });
    }

    if (session.visibility === 'PASSWORD_PROTECTED') {
      const authResult = verifySessionToken(token, code);
      if (!authResult.isValid) {
        socket.emit('session-state', {
          code: session.code,
          visibility: session.visibility,
          status: session.status,
          participantsCount: session.participants.filter(p => !p.isBanned).length
        });
        if (callback) callback({ success: false, message: 'Şifre doğrulama gerekli.', passwordRequired: true });
        return;
      }
    }

    socket.join(`session-${code}`);

    socket.emit('session-state', {
      question: session.question,
      status: session.status,
      statements: session.statements,
      analysis: session.analysis,
      participantsCount: session.participants.filter(p => !p.isBanned).length,
      visibility: session.visibility,
      passwordText: session.passwordText
    });

    if (callback) callback({ success: true });
  });

  // Admin Odasına Katılma
  socket.on('admin-join', ({ sessionCode, token } = {}) => {
    const code = sessionCode ? sessionCode.toUpperCase() : 'DEFAULT';
    
    // admin-join anında token'ı doğrula
    const authResult = verifySessionToken(token, code);
    if (!authResult.isValid || (authResult.type !== 'admin' && authResult.type !== 'moderator')) {
      socket.emit('auth-error', { message: authResult.message || 'Yetkisiz giriş.' });
      return;
    }

    socket.adminToken = token;
    socket.adminSessionCode = code;
    socket.join(`moderator-${code}`);
    
    const session = db.getSessionSync(code);
    if (session) {
      socket.emit('session-state', {
        question: session.question,
        status: session.status,
        statements: session.statements,
        analysis: session.analysis,
        participantsCount: session.participants.filter(p => !p.isBanned).length,
        visibility: session.visibility,
        passwordText: session.passwordText
      });

      if (session.analysis) {
        socket.emit('analysis-updated', {
          analysis: session.analysis,
          camps: session.analysis.camps,
          targetK: session.targetK
        });
      }

      socket.emit('moderation-queue', session.moderationQueue);
      socket.emit('participants-list', session.participants.filter(p => !p.isBanned).map(p => ({ id: p.id, nickname: p.nickname, justification: p.justification, isBot: p.isBot })));
      sendAiAccuracy(code, socket);
    }
  });

  // Katılımcı Kayıt
  socket.on('register-participant', ({ sessionCode, nickname, justification }, callback) => {
    const code = sessionCode ? sessionCode.toUpperCase() : 'DEFAULT';
    try {
      const session = db.getSessionSync(code);
      if (session && session.status === 'archived') {
        return callback({ success: false, message: 'Bu oturum artık aktif değil.' });
      }
      if (session && session.status === 'paused') {
        return callback({ success: false, message: 'Bu oturum duraklatıldı.', sessionPaused: true });
      }

      const participant = db.addParticipant(code, nickname, justification);
      const token = jwt.sign({
        type: 'participant_access',
        sessionCode: code,
        participantId: participant.id
      }, JWT_SECRET, { expiresIn: '24h' });

      callback({ success: true, participantId: participant.id, nickname: participant.nickname, token });
      // Moderatörlere bildir
      io.to(`moderator-${code}`).emit('participant-joined', {
        id: participant.id,
        nickname: participant.nickname,
        justification: participant.justification
      });
      io.to(`moderator-${code}`).emit('participants-list', session.participants.filter(p => !p.isBanned).map(p => ({ id: p.id, nickname: p.nickname, justification: p.justification, isBot: p.isBot })));

      io.to(`session-${code}`).emit('stats-update', { participantsCount: session.participants.filter(p => !p.isBanned).length });

      runAndBroadcastAnalysis(code, 'joinSession');
    } catch (err) {
      callback({ success: false, message: err.message || 'Kayıt sırasında hata oluştu' });
    }
  });

  // Görüş Ekleme (Socket fallback - HTTP API tercih edilir)
  socket.on('submit-statement', async ({ sessionCode, participantId, text }, callback) => {
    const code = sessionCode ? sessionCode.toUpperCase() : 'DEFAULT';
    const session = db.getSessionSync(code);
    if (!session) {
      return callback && callback({ success: false, message: 'Oturum bulunamadı.' });
    }

    // Oturum duraklatılmışsa görüş eklemeyi engelle
    if (session.status === 'paused') {
      return callback && callback({ success: false, message: 'Bu masada görüş alımı moderatör tarafından duraklatılmıştır.' });
    }

    const participant = session.participants.find(p => p.id === participantId);
    if (!participant || participant.isBanned) {
      return callback && callback({ success: false, message: 'Geçersiz katılımcı kimliği veya engellenmiş kullanıcı.' });
    }

    try {
      // Yapay zeka veya kural motoruyla görüş içeriğini denetle
      const aiResult = await evaluateOpinionContent(text, session.question);
      const aiWarning = aiResult.flagged ? aiResult.reason : null;

      db.addStatement(code, text, participant.nickname, false, false, aiWarning);
      if (callback) callback({ success: true, message: 'Görüşünüz moderasyon kuyruğuna alındı' });

      io.to(`moderator-${code}`).emit('moderation-queue', session.moderationQueue);
    } catch (err) {
      if (callback) callback({ success: false, message: err.message });
    }
  });

  socket.on('submit-vote', ({ sessionCode, participantId, statementId, voteValue }, callback) => {
    const code = sessionCode ? sessionCode.toUpperCase() : 'DEFAULT';
    const session = db.getSessionSync(code);
    if (session) {
      if (session.status === 'paused') {
        return callback && callback({ success: false, message: 'Masa duraklatıldığı için şu anda oy verilemez.' });
      }
      const participant = session.participants.find(p => p.id === participantId);
      if (participant && participant.isBanned) {
        return callback && callback({ success: false, message: 'Bu kullanıcı bu oturumdan engellenmiştir.' });
      }
    }

    const success = db.castVote(code, participantId, statementId, voteValue);
    
    if (success) {
      if (callback) callback({ success: true });
      runAndBroadcastAnalysis(code, 'castVote');
    } else {
      if (callback) callback({ success: false, message: 'Oy kaydedilemedi veya kullanıcı engelli' });
    }
  });

  // --- ADMIN/MODERATÖR SOCKET İŞLEMLERİ ---
  
  // Görüş Onaylama
  socket.on('admin-approve-statement', ({ sessionCode, statementId }) => {
    const code = sessionCode ? sessionCode.toUpperCase() : 'DEFAULT';
    if (!checkSocketAuth(code, true)) return;
    const statement = db.approveStatement(code, statementId);
    
    if (statement) {
      const session = db.getSessionSync(code);
      io.to(`moderator-${code}`).emit('moderation-queue', session.moderationQueue);
      io.to(`session-${code}`).emit('new-statement', statement);
      runAndBroadcastAnalysis(code, 'approveStatement');
      sendAiAccuracyToRoom(code);
    }
  });

  // Görüş Reddetme
  socket.on('admin-reject-statement', ({ sessionCode, statementId }) => {
    const code = sessionCode ? sessionCode.toUpperCase() : 'DEFAULT';
    if (!checkSocketAuth(code, true)) return;
    const statement = db.rejectStatement(code, statementId);
    
    if (statement) {
      const session = db.getSessionSync(code);
      io.to(`moderator-${code}`).emit('moderation-queue', session.moderationQueue);
      sendAiAccuracyToRoom(code);
    }
  });

  // Soru Güncelleme
  socket.on('admin-update-question', ({ sessionCode, newQuestion }) => {
    const code = sessionCode ? sessionCode.toUpperCase() : 'DEFAULT';
    if (!checkSocketAuth(code)) return;
    db.updateSessionQuestion(code, newQuestion);
    io.to(`session-${code}`).emit('question-updated', newQuestion);
    runAndBroadcastAnalysis(code, 'updateSessionQuestion');
  });

  // Simülasyon Çalıştırma (Katılımcı Yük Testi)
  socket.on('admin-run-simulation', ({ sessionCode, count }, callback) => {
    const code = sessionCode ? sessionCode.toUpperCase() : 'DEFAULT';
    if (!checkSocketAuth(code)) return;
    try {
      db.simulateBots(code, count);
      const session = db.getSessionSync(code);

      callback({ success: true, message: `${count} adet simüle katılımcı başarıyla oy verdi.` });
      
      io.to(`session-${code}`).emit('stats-update', { participantsCount: session.participants.filter(p => !p.isBanned).length });
      performAnalysis(code, 'runSimulation'); // Debounce beklemeden doğrudan çalıştır
    } catch (err) {
      callback({ success: false, message: `Simülasyon hatası: ${err.message}` });
    }
  });

  // Oturumu Sıfırlama
  socket.on('admin-reset-session', ({ sessionCode }, callback) => {
    const code = sessionCode ? sessionCode.toUpperCase() : 'DEFAULT';
    if (!checkSocketAuth(code)) return;
    try {
      db.reset(code);
      const session = db.getSessionSync(code);

      io.to(`session-${code}`).emit('session-reset', {
        question: session.question,
        status: session.status,
        statements: session.statements,
        analysis: session.analysis,
        participantsCount: session.participants.filter(p => !p.isBanned).length
      });

      io.to(`moderator-${code}`).emit('moderation-queue', session.moderationQueue);
      if (callback) callback({ success: true });
    } catch (err) {
      if (callback) callback({ success: false, message: err.message });
    }
  });

  // Oturum Durumu Güncelleme (Pause/Play)
  socket.on('admin-update-session-status', ({ sessionCode, status }) => {
    const code = sessionCode ? sessionCode.toUpperCase() : 'DEFAULT';
    if (!checkSocketAuth(code)) return;
    db.updateSessionStatus(code, status);
    
    // Hem normal odaya hem de moderatör odasına durum güncellemesini duyur
    io.to(`session-${code}`).emit('session-status-updated', { status });
    io.to(`moderator-${code}`).emit('session-status-updated', { status });
  });

  // Katılımcıyı Masadan Atma (Kick)
  socket.on('admin-kick-participant', ({ sessionCode, participantId }) => {
    const code = sessionCode ? sessionCode.toUpperCase() : 'DEFAULT';
    if (!checkSocketAuth(code, false)) return;
    const success = db.kickParticipant(code, participantId);
    
    if (success) {
      const session = db.getSessionSync(code);
      
      // Odaya atılma olayını ve güncel durumları bildir
      io.to(`session-${code}`).emit('participant-kicked', { participantId });
      io.to(`session-${code}`).emit('participant-left', { participantId });
      io.to(`moderator-${code}`).emit('participant-left', { participantId });
      io.to(`moderator-${code}`).emit('participants-list', session.participants.filter(p => !p.isBanned).map(p => ({ id: p.id, nickname: p.nickname, justification: p.justification, isBot: p.isBot })));
      
      io.to(`session-${code}`).emit('stats-update', { participantsCount: session.participants.filter(p => !p.isBanned).length });
      
      // Analiz motorunu tetikle (oylar çıkarıldığı için koordinatlar güncellenecektir)
      runAndBroadcastAnalysis(code, 'kickParticipant');
    }
  });

  // Kamp Sayısı Güncelleme
  socket.on('admin-update-camps-count', ({ sessionCode, targetK }) => {
    const code = sessionCode ? sessionCode.toUpperCase() : 'DEFAULT';
    if (!checkSocketAuth(code, true)) return;
    const success = db.updateSessionCampsCount(code, targetK);
    if (success) {
      runAndBroadcastAnalysis(code, 'updateSessionCampsCount');
    }
  });

  // Kamp Yeniden Adlandırma
  socket.on('admin-rename-camp', ({ sessionCode, campId, newName }) => {
    const code = sessionCode ? sessionCode.toUpperCase() : 'DEFAULT';
    if (!checkSocketAuth(code, true)) return;
    const success = db.renameSessionCamp(code, campId, newName);
    if (success) {
      runAndBroadcastAnalysis(code, 'renameSessionCamp');
    }
  });

  // Gönüllü Ayrılma (Masadan Kalkma)
  socket.on('leave-session', ({ sessionCode, participantId }) => {
    const code = sessionCode ? sessionCode.toUpperCase() : 'DEFAULT';
    if (participantId) {
      const removed = db.removeParticipant(code, participantId);
      if (removed) {
        const session = db.getSessionSync(code);
        if (session) {
          io.to(`moderator-${code}`).emit('participants-list', session.participants.filter(p => !p.isBanned).map(p => ({ id: p.id, nickname: p.nickname, justification: p.justification, isBot: p.isBot })));
          io.to(`session-${code}`).emit('stats-update', { participantsCount: session.participants.filter(p => !p.isBanned).length });
        }
      }
    }
    socket.leave(`session-${code}`);
  });

  socket.on('disconnect', () => {
    console.log(`Bağlantı kesildi: ${socket.id}`);
    // Not: Bağlantı kesintisinde rumuz temizleme yapılmıyor.
    // Çünkü kullanıcı sayfayı yenileyerek aynı oturumda geri dönebilir.
    // Gönüllü çıkışlar leave-session event'i üzerinden yönetilir.
  });
});

// ─── GÜVENLİ KAPANMA MEKANİZMASI (GRACEFUL SHUTDOWN) ───
// Beklenmeyen yakalanmamış hatalarda (uncaughtException / unhandledRejection)
// sunucu iç durumunun (kilitler, DB transaksiyonları) bozulmasını önlemek için
// açık soketler kapatılır, 500ms grace period ile bekleyen yazmalar beklenir ve process.exit(1) çağrılır.
let isShuttingDown = false;

export function gracefulShutdown(err, origin = 'uncaughtException') {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.error(`💥 [CRITICAL UNHANDLED ERROR] Origin: ${origin} — Sunucu güvenli şekilde kapatılıyor...`, err?.stack || err);

  // 1. Güvenlik Zaman Aşımı: 2 saniye içinde kapanış tamamlanmazsa süreci zorla sonlandır
  const forceExitTimeout = setTimeout(() => {
    console.error('⚠️ [GRACEFUL SHUTDOWN TIMEOUT] Kapanış zaman aşımına uğradı, zorla sonlandırılıyor (exit code 1).');
    process.exit(1);
  }, 2000);
  if (forceExitTimeout.unref) forceExitTimeout.unref();

  try {
    // 2. Yeni HTTP ve Socket.io bağlantılarını reddet
    if (io) {
      io.disconnectSockets(true);
      io.close();
    }
    if (httpServer && httpServer.listening) {
      httpServer.close();
    }
  } catch (shutdownErr) {
    console.error('⚠️ [SHUTDOWN ERROR]', shutdownErr);
  }

  // 3. 500ms grace period sonrası sonlandır
  setTimeout(() => {
    console.log('🛑 Sunucu güvenli şekilde kapatıldı (process.exit code 1).');
    process.exit(1);
  }, 500);
}

if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  process.on('uncaughtException', (err) => gracefulShutdown(err, 'uncaughtException'));
  process.on('unhandledRejection', (reason) => gracefulShutdown(reason, 'unhandledRejection'));
}

if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  const PORT = process.env.PORT || 3001;
  httpServer.listen(PORT, () => {
    console.log(`Sunucu http://localhost:${PORT} portunda çalışıyor.`);
  });
}
