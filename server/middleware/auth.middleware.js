import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { db } from '../database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'kamusal_alan_gizli_anahtar';

/**
 * Ortak JWT Token doğrulama fonksiyonu (REST ve Socket.io tarafından ortak kullanılır)
 */
export function verifySessionToken(token, sessionCode) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Admin tipi token global yetkiye sahiptir
    if (decoded.type === 'admin') {
      return { isValid: true, type: 'admin', decoded };
    }

    if (!sessionCode) {
      return { isValid: false, message: 'Oturum kodu belirtilmedi.' };
    }

    const code = sessionCode.toUpperCase();

    // Moderatör tokenı kontrolü
    if (decoded.type === 'moderator') {
      if (decoded.sessionCode.toUpperCase() !== code) {
        return { isValid: false, message: 'Yetkisiz işlem: Geçersiz oturum moderatörü.' };
      }
      return { isValid: true, type: 'moderator', decoded };
    }

    // Katılımcı erişim tokenı kontrolü
    if (decoded.type === 'participant_access') {
      if (decoded.sessionCode.toUpperCase() !== code) {
        return { isValid: false, message: 'Yetkisiz işlem: Geçersiz oturum kodu.' };
      }

      const session = db.getSessionSync(code);
      if (session && session.passwordUpdatedAt) {
        const passwordUpdatedTime = Math.floor(new Date(session.passwordUpdatedAt).getTime() / 1000);
        if (decoded.iat < passwordUpdatedTime) {
          return { isValid: false, reason: 'PASSWORD_CHANGED', message: 'Oturum şifresi değiştirildi. Lütfen yeni şifreyi girin.' };
        }
      }
      return { isValid: true, type: 'participant_access', decoded };
    }

    return { isValid: false, message: 'Geçersiz token tipi.' };
  } catch (err) {
    return { isValid: false, message: 'Geçersiz veya süresi dolmuş token.' };
  }
}

// 1. Admin yetkilendirme middleware'i
export function authenticateAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Yetkisiz erişim: Token bulunamadı.' });
  }

  const token = authHeader.split(' ')[1];
  const authResult = verifySessionToken(token, null);
  if (!authResult.isValid || authResult.type !== 'admin') {
    return res.status(403).json({ success: false, message: authResult.message || 'Erişim reddedildi: Admin yetkisi gerekiyor.' });
  }
  req.admin = authResult.decoded;
  next();
}

// 2. Şifreli oturum giriş denemeleri için hız sınırlayıcı (Rate Limiter)
export const passwordRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 5,
  message: {
    success: false,
    message: 'Çok fazla hatalı şifre denemesi yaptınız. Güvenliğiniz için 15 dakika kilitlendiniz.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true
});

// 3. Katılımcı oturum erişim kontrolü (Public / Şifreli)
export async function checkParticipantAccess(req, res, next) {
  const code = req.params.code || req.body.sessionCode || req.query.sessionCode;
  if (!code) {
    return res.status(400).json({ success: false, message: 'Oturum kodu belirtilmedi.' });
  }

  const session = await db.getSessionByCode(code);
  if (!session) {
    return res.status(404).json({ success: false, message: 'Oturum bulunamadı.' });
  }

  // Oturum duraklatılmışsa erişimi engelle
  if (session.status === 'paused') {
    return res.status(403).json({ success: false, message: 'Bu oturum duraklatılmıştır.', sessionPaused: true });
  }

  // Oturum PUBLIC ise doğrudan geçişe izin ver
  if (session.visibility === 'PUBLIC') {
    return next();
  }

  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Bu masaya erişmek için şifre veya oturum yetkisi gerekiyor.', passwordRequired: true });
  }

  const authResult = verifySessionToken(token, code);
  
  if (!authResult.isValid) {
    if (authResult.reason === 'PASSWORD_CHANGED') {
      return res.status(403).json({ 
        success: false, 
        message: authResult.message, 
        passwordRequired: true 
      });
    }
    return res.status(401).json({ success: false, message: authResult.message, passwordRequired: true });
  }

  if (authResult.type === 'moderator') {
    req.moderator = authResult.decoded;
  } else if (authResult.type === 'participant_access') {
    req.participantAccess = authResult.decoded;
  }

  next();
}

// 4. Moderatör yetki kontrolü
export async function checkModerator(req, res, next) {
  const code = req.params.code || req.body.sessionCode;
  if (!code) {
    return res.status(400).json({ success: false, message: 'Oturum kodu belirtilmedi.' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Moderatör yetkisi bulunamadı.' });
  }

  const token = authHeader.split(' ')[1];
  const authResult = verifySessionToken(token, code);
  if (!authResult.isValid || authResult.type !== 'moderator') {
    return res.status(403).json({ success: false, message: authResult.message || 'Yetkisiz işlem: Sadece bu masanın moderatörü işlem yapabilir.' });
  }
  req.moderator = authResult.decoded;
  next();
}

/**
 * Helper to check if a decoded token belongs to the owner of the session.
 */
export function isSessionOwner(decoded, session) {
  if (!decoded || !session) return false;
  if (decoded.type === 'admin') {
    return !!session.creatorId && session.creatorId === decoded.id;
  }
  if (decoded.type === 'moderator') {
    return !!decoded.sessionCode && decoded.sessionCode.toUpperCase() === session.code.toUpperCase();
  }
  return false;
}

/**
 * Middleware to require ownership of the session (creator admin or session moderator).
 */
export async function requireSessionOwnership(req, res, next) {
  const code = req.params.code || req.body.sessionCode;
  if (!code) {
    return res.status(400).json({ success: false, message: 'Oturum kodu belirtilmedi.' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Yetkilendirme token\'ı bulunamadı.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const session = await db.getSessionByCode(code.toUpperCase());
    if (!session) {
      return res.status(404).json({ success: false, message: 'Oturum bulunamadı.' });
    }

    const isOwner = isSessionOwner(decoded, session);
    if (!isOwner) {
      return res.status(403).json({ success: false, message: 'Bu işlem için yetkiniz yok (sahiplik gerekir).' });
    }

    req.decoded = decoded;
    req.session = session;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Geçersiz veya süresi dolmuş token.' });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
}
