import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

function logDryRunCall(type) {
  try {
    const logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const logFile = path.join(logDir, 'llm-dry-run.jsonl');
    const entry = JSON.stringify({ type, timestamp: new Date().toISOString() }) + '\n';
    fs.appendFileSync(logFile, entry, 'utf8');
  } catch (err) {
    console.error('Failed to write dry-run log:', err.message);
  }
}

// Ortam değişkenlerinden yapılandırmayı oku
const apiKey = process.env.LLM_API_KEY ? process.env.LLM_API_KEY.replace(/['"]/g, '').trim() : undefined;
const baseURL = process.env.LLM_BASE_URL ? process.env.LLM_BASE_URL.replace(/['"]/g, '').trim() : undefined;
const modelName = process.env.LLM_MODEL_NAME ? process.env.LLM_MODEL_NAME.replace(/['"]/g, '').trim() : 'gpt-3.5-turbo';

// Startup Sanity Check & Config Logging (Requirement 5)
console.log(`🤖 [LLM CONFIG] Initializing LLM Service...`);
console.log(`   - Model Name: '${modelName}'`);
console.log(`   - Base URL:   '${baseURL || 'OpenAI Default Endpoint'}'`);
console.log(`   - API Key:    ${apiKey ? '*** PROVIDED ***' : '⚠️ NOT PROVIDED (Fallback Mode Active)'}`);

let openaiClient = null;
if (apiKey) {
  try {
    openaiClient = new OpenAI({
      apiKey: apiKey,
      baseURL: baseURL || undefined,
    });
  } catch (error) {
    console.warn('⚠️ OpenAI istemcisi başlatılamadı, fallback modu kullanılacak:', error.message);
  }
}

// ==========================================
// 1. IN-MEMORY RESULT CACHING LAYER (Req 1 & Req 2)
// ==========================================
const llmCache = new Map();
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // Mutation tabanlı sıfırlama olduğu için uzun saklama

export function generateHash(data) {
  return crypto.createHash('sha256').update(typeof data === 'string' ? data : JSON.stringify(data)).digest('hex');
}

export function getFromLlmCache(key, hash, sessionCode = '', version = 1) {
  const cached = llmCache.get(key);
  if (cached) {
    if (Date.now() - cached.timestamp < CACHE_TTL_MS && cached.hash === hash) {
      console.log(`⚡ [LLM CACHE HIT — NO SESSION CHANGES] Session ${sessionCode || key} (v${version}) unchanged since last analysis, serving cached result, 0 tokens used.`);
      return cached.result;
    }
  }
  return null;
}

export function setInLlmCache(key, hash, result) {
  if (result !== undefined && result !== null) {
    llmCache.set(key, { result, hash, timestamp: Date.now() });
    console.log(`💾 [LLM CACHE STORE] Stored successful result for key: ${key}`);
  }
}

/**
 * Oturumda yeni oy, görüş veya soru değiştiğinde tüm önbellek kaydını temizler (Req 3)
 */
export function invalidateLlmCacheForSession(sessionCode) {
  if (!sessionCode) return;
  const prefix = sessionCode.toUpperCase();
  let count = 0;
  for (const key of llmCache.keys()) {
    if (key.includes(`:${prefix}`) || key.endsWith(`:${prefix}`)) {
      llmCache.delete(key);
      count++;
    }
  }
  if (count > 0) {
    console.log(`🧹 [LLM CACHE INVALIDATED] Removed ${count} cached entries for mutated session: ${prefix}`);
  }
}

export function clearAllLlmCache() {
  llmCache.clear();
  console.log(`🧹 [LLM CACHE CLEARED] Removed all LLM cache entries`);
}

// =======================================================
// 2. RATE LIMITER (10 RPM) & CIRCUIT BREAKER (429-aware)
// =======================================================

// Proactive Rate Limiter (Proaktif İstek Sınırlayıcı)
const MAX_REQUESTS_PER_MINUTE = 10;
const requestTimestampsWindow = [];

function checkAndRecordRateLimit() {
  const now = Date.now();
  // 60 saniyeden eski zaman damgalarını temizle
  while (requestTimestampsWindow.length > 0 && requestTimestampsWindow[0] <= now - 60000) {
    requestTimestampsWindow.shift();
  }
  
  if (requestTimestampsWindow.length >= MAX_REQUESTS_PER_MINUTE) {
    return false; // Limit aşıldı!
  }
  
  requestTimestampsWindow.push(now);
  return true; // İstek izni verildi
}

// Circuit breaker state — module-level, shared across all call sites
let circuitBreakerBlockedUntil = 0; // epoch ms; 0 = open (not tripped)
const CIRCUIT_BREAKER_DEFAULT_COOLDOWN_MS = 60_000; // 60 s fallback when no Retry-After header
let lastRpdQuotaErrorTimestamp = 0; // Günlük RPD kotası dolduğunda kaydedilen zaman damgası

export function getLlmQuotaStatus() {
  const now = Date.now();
  const isRpdExhausted = lastRpdQuotaErrorTimestamp > 0 && (now - lastRpdQuotaErrorTimestamp) < 24 * 60 * 60 * 1000;
  const cbOpen = isCircuitBreakerOpen();
  const cooldownRemainingSec = circuitBreakerBlockedUntil > now
    ? Math.ceil((circuitBreakerBlockedUntil - now) / 1000)
    : 0;
  return {
    isRpdExhausted,
    lastRpdErrorTimestamp: lastRpdQuotaErrorTimestamp || null,
    isCircuitBreakerOpen: cbOpen,
    cooldownRemainingSec,
    modelName,
    hasApiKey: !!apiKey
  };
}

export function resetRpdQuotaStatus() {
  lastRpdQuotaErrorTimestamp = 0;
  circuitBreakerBlockedUntil = 0;
  console.log('🟢 [LLM QUOTA STATUS RESET] RPD kota ve circuit breaker durumu sıfırlandı.');
}

/**
 * 429 alındığında Retry-After başlığını okur (yoksa 60 s kullanır),
 * o süre boyunca TÜM LLM çağrılarını bloke eder ve fallback'e düşer.
 * Bu sayede hata sayısı 3× katlanmaz.
 */
function tripCircuitBreaker(err, customCooldownMs = null) {
  const retryAfterHeader =
    err?.headers?.['retry-after'] ||
    err?.response?.headers?.['retry-after'] ||
    err?.error?.headers?.['retry-after'];

  const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : null;
  const cooldownMs = customCooldownMs || (
    (Number.isFinite(retryAfterSec) && retryAfterSec > 0)
      ? retryAfterSec * 1000
      : CIRCUIT_BREAKER_DEFAULT_COOLDOWN_MS
  );

  circuitBreakerBlockedUntil = Date.now() + cooldownMs;
  console.warn(
    `🔴 [LLM CIRCUIT BREAKER TRIPPED] 429 TooManyRequests — LLM çağrıları ` +
    `${Math.round(cooldownMs / 1000)}s boyunca bloke edildi. ` +
    `Tüm istekler fallback motora yönlendirilecek. ` +
    `Tekrar açılma: ${new Date(circuitBreakerBlockedUntil).toLocaleTimeString('tr-TR')}`
  );
}

function isCircuitBreakerOpen() {
  if (circuitBreakerBlockedUntil === 0) return false;
  if (Date.now() >= circuitBreakerBlockedUntil) {
    circuitBreakerBlockedUntil = 0;
    console.log('🟢 [LLM CIRCUIT BREAKER RESET] Cooldown sona erdi, LLM çağrıları yeniden aktif.');
    return false;
  }
  return true;
}

async function executeLlmWithRetry(requestParams, callType, maxRetries = 2) {
  if (!openaiClient) return null;

  // 1. Proaktif RPM Kontrolü (Dakikada maks 10 istek)
  if (!checkAndRecordRateLimit()) {
    console.warn(`⏳ [LLM RATE LIMITER] Dakikalık limit (10 RPM) aşıldı! ${callType} isteği atlandı — kural tabanlı motor kullanılacak.`);
    return null;
  }

  // 2. Circuit breaker açıksa (429 cooldown veya 24-saatlik RPD bloku) direkt fallback'e düş
  if (isCircuitBreakerOpen()) {
    const remainingSec = Math.ceil((circuitBreakerBlockedUntil - Date.now()) / 1000);
    console.warn(`⏸️ [LLM CIRCUIT BREAKER OPEN] ${callType} isteği atlanıyor — ${remainingSec}s daha bloke. Fallback kullanılıyor.`);
    return null;
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Makul 12 saniyelik çağrı timeout'u (soket asılı kalmalarını önler)
      const timeoutMs = Number(process.env.LLM_CALL_TIMEOUT_MS) || 12000;
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('LLM_CALL_TIMEOUT')), timeoutMs)
      );

      const response = await Promise.race([
        openaiClient.chat.completions.create(requestParams),
        timeoutPromise
      ]);

      const raw = response.choices[0]?.message?.content?.trim();
      const sanitized = sanitizeLLMResponse(raw, callType);
      if (sanitized) {
        if (attempt > 0) {
          console.log(`✅ [LLM RETRY SUCCESS] ${callType} request succeeded on attempt ${attempt + 1}/${maxRetries + 1}`);
        }
        return sanitized;
      }
      console.warn(`⚠️ [LLM CALL ${attempt + 1}/${maxRetries + 1}] Response failed sanitization for ${callType}`);
    } catch (err) {
      const status = err.status || err.statusCode || (err.response && err.response.status);
      const message = err.message || '';
      const msgLower = message.toLowerCase();

      // ─── RPD (Requests Per Day) / GÜNLÜK KOTA AŞIMI TESPİTİ ─────────────────
      // Günlük RPD limiti dolduğunda birkaç saniye beklemek hiçbir şeyi çözmez.
      // Bu nedenle retry yapılmadan ANINDA kural tabanlı motor devreye sokulur.
      const isRpdError =
        (status === 429 || msgLower.includes('429')) &&
        (msgLower.includes('quota') ||
         msgLower.includes('daily') ||
         msgLower.includes('rpd') ||
         msgLower.includes('resource_exhausted') ||
         msgLower.includes('per_day') ||
         msgLower.includes('per day') ||
         msgLower.includes('exceeded your current quota') ||
         msgLower.includes('free tier'));

      if (isRpdError) {
        lastRpdQuotaErrorTimestamp = Date.now();
        console.error(`🚨 [LLM RPD QUOTA EXHAUSTED] Günlük API kotası (RPD / Resource Exhausted) aşıldı! Retry yapılmadan ANINDA kural tabanlı fallback'e geçiliyor.`);
        tripCircuitBreaker(err, 24 * 60 * 60 * 1000); // 24 saatlik devre kesici
        return null; // RETRY YOK — anında fallback!
      }

      const is404 = status === 404 || message.includes('404') || msgLower.includes('not found');
      const is401 = status === 401 || message.includes('401') || msgLower.includes('unauthorized');
      const is429 = status === 429 || message.includes('429') || msgLower.includes('too many requests');

      if (is404) {
        console.error(`❌ [LLM 404] Model '${modelName}' veya endpoint '${baseURL || 'default'}' 404 döndürdü. Fallback.`);
        return null;
      }
      if (is401) {
        console.error(`❌ [LLM 401] Geçersiz API anahtarı veya yetkisiz endpoint. Fallback.`);
        return null;
      }
      if (is429) {
        // Normal 429 (RPM limit) — Devre kesiciyi devreye al ve retry yapmadan çık
        tripCircuitBreaker(err);
        return null;
      }

      if (message === 'LLM_CALL_TIMEOUT') {
        console.warn(`⏰ [LLM TIMEOUT ${attempt + 1}/${maxRetries + 1}] ${callType} isteği 12s içerisinde yanıt vermedi. Retrying/Falling back...`);
      } else {
        console.warn(`⚠️ [LLM RETRY ${attempt + 1}/${maxRetries + 1}] ${callType} API Error (Status: ${status || 'N/A'}): ${message}`);
      }

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s
        console.log(`⏳ [LLM BACKOFF] Waiting ${delay}ms before retry ${attempt + 2}/${maxRetries + 1}...`);
        await new Promise(res => setTimeout(res, delay));
      }
    }
  }

  console.warn(`❌ [LLM RETRY CAP EXCEEDED] All ${maxRetries + 1} attempts failed for ${callType}. Falling back to rule-based engine.`);
  return null;
}

function cleanLLMOutput(text) {
  if (!text) return '';
  let cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .trim();

  if (/^(Thinking Process:|1\.\s+\*\*|\*\*Thinking|\*\*Analyze|\d+\.\s+\*\*|\*\s+\*\*)/i.test(cleaned) || cleaned.includes('Thinking Process:')) {
    const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch && codeBlockMatch[1]) {
      return codeBlockMatch[1].trim();
    }

    const paragraphs = cleaned.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    const nonThinking = paragraphs.filter(p => 
      !/^(Thinking Process|\d+\.|\*|\-|\#|\*\*Role|\*\*Input|\*\*Task|\*\*Constraints|\*\*Analyze|\*\*Output|\*\*Draft|\*\*Refining|\*\*Evaluation|\*\*Step|\*\*Data)/i.test(p) &&
      !p.toLowerCase().includes('thinking process') &&
      !p.includes('**Role:**') &&
      !p.includes('**Input:**') &&
      !p.includes('**Data:**')
    );

    if (nonThinking.length > 0) {
      cleaned = nonThinking.join('\n\n');
    } else {
      const lastP = paragraphs[paragraphs.length - 1] || '';
      const quoted = lastP.match(/"([^"]+)"/);
      if (quoted && quoted[1]) {
        cleaned = quoted[1];
      } else {
        const lines = lastP.split('\n').map(l => l.trim()).filter(Boolean);
        const cleanLines = lines.filter(l => !l.startsWith('*') && !l.startsWith('-') && !/^\d+\./.test(l));
        cleaned = cleanLines.length > 0 ? cleanLines[cleanLines.length - 1] : lastP;
      }
    }
  }

  return cleaned
    .replace(/^[*#\s]*\*(?:Revised Draft|Draft|Output|Response|Final Response|Refinement|Drafting|Paragraph \d+):\*\s*/gi, '')
    .replace(/^(?:Drafting|Refinement|Paragraph \d+)[\s\S]*?(?:Summary|Tone|Overview)?:/gi, '')
    .replace(/^["']|["']$/g, '')
    .trim();
}

export function extractDelimited(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;
  const match = rawText.match(/\[CEVAP\]([\s\S]*?)\[\/CEVAP\]/i);
  if (match && match[1]) {
    const extracted = match[1].trim();
    return extracted.length > 0 ? extracted : null;
  }
  return null;
}

export function sanitizeLLMResponse(rawText, callType) {
  if (!rawText || typeof rawText !== 'string' || rawText.trim().length === 0) {
    return null;
  }

  let cleaned = cleanLLMOutput(rawText);
  if (!cleaned || cleaned.length === 0) return null;

  const metaRegex = /(Thinking Process|\*\*Role:\*\*|\*\*Input:\*\*|\*\*Input Data:\*\*|\*\*Task:\*\*|Analyze the Request|Drafting|Refining|Revised Draft|Final Output|\*\*Constraints:\*\*|1\.\s*\*\*Analyze|2\.\s*\*\*Draft|3\.\s*\*\*Refine)/i;
  if (metaRegex.test(cleaned)) return null;

  switch (callType) {
    case 'axis-label':
      if (cleaned.length > 100 || cleaned.includes('\n') || /^[*#-]|^\d+\./.test(cleaned)) return null;
      break;

    case 'polarization-impact':
      if (cleaned.length > 200 || /^[*#-]|^\d+\./.test(cleaned)) return null;
      break;

    case 'cluster-summary':
      if (cleaned.length > 1000 || /^[*#-]|^\d+\./.test(cleaned)) return null;
      break;

    case 'moderation':
      try {
        let jsonStr = cleaned;
        if (jsonStr.startsWith('```json')) jsonStr = jsonStr.replace(/^```json/, '').replace(/```$/, '').trim();
        else if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```/, '').replace(/```$/, '').trim();
        const parsed = JSON.parse(jsonStr);
        if (typeof parsed.flagged !== 'boolean') return null;
      } catch (e) {
        return null;
      }
      break;

    case 'consensus-discovery':
      if (cleaned.length > 1500) return null;
      break;

    case 'executive-summary':
      if (cleaned.length < 50 || cleaned.length > 2500) return null;
      break;

    default:
      break;
  }

  return cleaned;
}

export function generateFallbackSummary(campId, topStatements) {
  if (!topStatements || topStatements.length === 0) {
    return `Grup ${String.fromCharCode(65 + campId)}: Henüz fikir örüntüsü netleşmemiş katılımcılar.`;
  }

  const mainStatements = topStatements.slice(0, 2).map(st => {
    let text = (st.text || st.statement?.text || '').replace(/["']/g, '').trim();
    if (text.length > 60) text = text.substring(0, 57) + '...';
    return `"${text}"`;
  });

  if (mainStatements.length === 1) {
    return `Bu grup, ağırlıklı olarak ${mainStatements[0]} görüşünü desteklemektedir.`;
  }

  return `Bu grup, öncelikli olarak ${mainStatements[0]} ve ${mainStatements[1]} fikirlerini destekleyen ve bu doğrultuda ortaklaşan katılımcılardan oluşmaktadır.`;
}

// ========================================================
// 3. BATCHED CLUSTER SUMMARY GENERATION (Version-Tied Cache)
// ========================================================
export async function generateAllClusterSummaries(camps, question = '', sessionCode = 'DEFAULT', version = 1, dirtyCampIds = null) {
  if (!camps || camps.length === 0) return {};

  const dirtySet = dirtyCampIds instanceof Set 
    ? dirtyCampIds 
    : (Array.isArray(dirtyCampIds) ? new Set(dirtyCampIds) : null);

  // dirtyCampIds verilmişse kampları dirty vs clean olarak ayır, verilmemişse tümünü dirty kabul et
  const dirtyCamps = dirtySet ? camps.filter(c => dirtySet.has(c.id)) : camps;
  const cleanCamps = dirtySet ? camps.filter(c => !dirtySet.has(c.id)) : [];

  const resultMap = {};

  // Değişmeyen (clean) kamplar önceki özetini aynen korur
  cleanCamps.forEach(c => {
    resultMap[c.id] = c.summary || generateFallbackSummary(c.id, c.topStatements);
  });

  // 4. HİÇBİR KAMP DEĞİŞMEDİYSE LLM'E HİÇ GİTME
  if (dirtyCamps.length === 0) {
    console.log(`⚡ [INCREMENTAL SUMMARY] Oturum ${sessionCode} — Hiçbir kamp değişmedi (0 dirty), LLM çağrısı yapılmadı, tüm ${camps.length} kamp cache'ten korundu.`);
    return resultMap;
  }

  // 6. LOGLAMA
  const dirtyNamesStr = dirtyCamps.map((c, i) => c.name || `Grup ${String.fromCharCode(65 + (c.id !== undefined ? c.id : i))}`).join(', ');
  console.log(`🔄 [INCREMENTAL SUMMARY] Oturum ${sessionCode} — ${camps.length} kamptan sadece ${dirtyCamps.length}'i (${dirtyNamesStr}) LLM'e gönderildi, ${cleanCamps.length} kamp cache'ten korundu.`);

  if (!openaiClient || process.env.LLM_DRY_RUN === 'true') {
    dirtyCamps.forEach(c => {
      resultMap[c.id] = generateFallbackSummary(c.id, c.topStatements);
    });
    return resultMap;
  }

  const promptClusters = dirtyCamps.map((c, i) => {
    const topSts = (c.topStatements || []).slice(0, 3).map(st => `  - "${st.text || st.statement?.text}" (%${st.approvalRate || 0})`).join('\n');
    return `Grup ID ${c.id} ("${c.name || 'Grup ' + String.fromCharCode(65 + i)}"):\n${topSts}`;
  }).join('\n\n');

  const prompt = `Aşağıda "${question}" konusundaki kamusal müzakere oturumunda yer alan fikir grupları ve en çok destekledikleri görüşler verilmiştir:

${promptClusters}

Görevin: Her bir fikir grubu için 1-2 cümlelik tarafsız Türkçe profil özeti üret.
Çıktıyı SADECE aşağıdaki JSON formatında ver, başka hiçbir metin veya açıklama ekleme:
{
  "summaries": [
    { "campId": 0, "summary": "..." }
  ]
}`;

  const requestParams = {
    model: modelName,
    messages: [
      { role: 'system', content: 'Sen fikir gruplarını özetleyen ve SADECE geçerli JSON formatında yanıt veren bir analiz uzmanısın.' },
      { role: 'user', content: prompt }
    ],
    max_tokens: 600,
    temperature: 0.3
  };

  const rawResult = await executeLlmWithRetry(requestParams, 'cluster-summary');
  
  if (rawResult) {
    try {
      let jsonStr = rawResult;
      if (jsonStr.startsWith('```json')) jsonStr = jsonStr.replace(/^```json/, '').replace(/```$/, '').trim();
      else if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```/, '').replace(/```$/, '').trim();
      const parsed = JSON.parse(jsonStr);
      if (parsed && Array.isArray(parsed.summaries)) {
        parsed.summaries.forEach(s => {
          if (s.campId !== undefined && s.summary) {
            resultMap[s.campId] = s.summary;
          }
        });
      }
    } catch (err) {
      console.warn(`⚠️ [LLM BATCH PARSE ERROR] Batched cluster summaries JSON parse failed: ${err.message}`);
    }
  }

  dirtyCamps.forEach(c => {
    if (!resultMap[c.id]) {
      resultMap[c.id] = generateFallbackSummary(c.id, c.topStatements);
    }
  });

  return resultMap;
}

export async function generateClusterSummary(campId, topStatements, question = '', sessionCode = 'DEFAULT', version = 1) {
  if (process.env.LLM_DRY_RUN === 'true') {
    logDryRunCall('cluster-summary');
    return `[DRY-RUN] Küme Özeti (Grup ${campId})`;
  }

  const singleCacheKey = `single-cluster-summary:${sessionCode}:${campId}:v${version}`;
  const hash = generateHash({ question, topStatements: (topStatements || []).slice(0, 3).map(s => s.text), version });
  const cached = getFromLlmCache(singleCacheKey, hash, sessionCode, version);
  if (cached) return cached;

  const batched = await generateAllClusterSummaries([{ id: campId, topStatements }], question, sessionCode, version);
  const result = batched[campId] || generateFallbackSummary(campId, topStatements);
  setInLlmCache(singleCacheKey, hash, result);
  return result;
}

function evaluateOpinionFallback(text) {
  const cleanText = text.toLowerCase().trim();
  const urlPattern = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-z0-9]+\.(com|net|org|edu|gov|mil|info|biz|co|io|xyz|info|tr|us|uk|de|ru|asia|online|site|app|dev))/i;
  if (urlPattern.test(cleanText)) {
    return { flagged: true, reason: 'Reklam veya spam bağlantı adresi içeriyor olabilir.' };
  }

  if (cleanText.length < 5) {
    return { flagged: true, reason: 'Görüş metni çok kısa veya anlamsız.' };
  }
  const randomPattern = /(asdasd|qwert|sdfgh|zxcvb|yhnjm)/;
  if (randomPattern.test(cleanText)) {
    return { flagged: true, reason: 'Anlamsız karakter dizisi (spam) içeriyor olabilir.' };
  }

  const badWords = ['siktir', 'sikik', 'orospu', 'amk', 'aq', 'picoğlu', 'göt', 'şerefsiz', 'amına', 'yavşak', 'ibne', 'piç', 'aptal', 'salak', 'gerizekalı', 'amguard', 'orospuçocuğu'];
  for (const word of badWords) {
    if (cleanText.includes(word)) {
      return { flagged: true, reason: 'Hakaret veya uygunsuz dil (küfür/argo) içeriyor olabilir.' };
    }
  }

  return { flagged: false, reason: null };
}

export async function evaluateOpinionContent(text, question) {
  if (process.env.LLM_DRY_RUN === 'true') {
    logDryRunCall('moderation');
    return { flagged: false, reason: null };
  }

  if (!text || text.trim().length === 0) {
    return { flagged: true, reason: 'Görüş metni boş olamaz.' };
  }

  if (!openaiClient) {
    return evaluateOpinionFallback(text);
  }

  const prompt = `
Aşağıdaki görüşün uygunluğunu müzakere konusu çerçevesinde değerlendir.

Müzakere Konusu/Sorusu: "${question}"
Gönderilen Görüş: "${text}"

Görevin: Bu görüşü 4 ana kritere göre değerlendir:
1. Hakaret, küfür, nefret söylemi veya saldırgan bir üslup var mı?
2. Reklam, spam, anlamsız karakter dizileri (örn. "asdasd") veya ilgisiz bağlantılar içeriyor mu?
3. Konuyla tamamen alakasız mı?
4. Çok kısa veya tamamen anlamsız bir kelimeden mi ibaret?

Yanıt Formatı:
Sadece geçerli bir JSON objesi döndür.
{"flagged": true, "reason": "Kısa Türkçe gerekçe (max 10 kelime)."} VEYA {"flagged": false, "reason": null}
`;

  const requestParams = {
    model: modelName,
    messages: [
      { role: 'system', content: 'Sen müzakere görüşlerini denetleyen ve SADECE JSON yanıt veren bir moderatör yardımcısısın.' },
      { role: 'user', content: prompt }
    ],
    max_tokens: 100,
    temperature: 0.1,
  };

  const content = await executeLlmWithRetry(requestParams, 'moderation');
  if (!content) return evaluateOpinionFallback(text);

  try {
    let jsonStr = content;
    if (jsonStr.startsWith('```json')) jsonStr = jsonStr.replace(/^```json/, '').replace(/```$/, '').trim();
    else if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```/, '').replace(/```$/, '').trim();
    const result = JSON.parse(jsonStr);
    return { flagged: !!result.flagged, reason: result.reason || null };
  } catch (err) {
    return evaluateOpinionFallback(text);
  }
}

export async function generateAxisLabel(axisName, topStatements) {
  if (process.env.LLM_DRY_RUN === 'true') {
    logDryRunCall('axis-label');
    return `[DRY-RUN] Eksen ${axisName.toUpperCase()} Etiketi`;
  }

  if (!openaiClient || !topStatements || topStatements.length === 0) {
    return generateAxisFallbackSummary(axisName, topStatements);
  }

  const statementsText = topStatements
    .map((st, i) => `${i + 1}. Görüş: "${st.statement.text}" (Yük Ağırlığı: ${st.loading.toFixed(3)})`)
    .join('\n');

  const prompt = `Sen PCA eksenlerini temsil ettikleri ana fikre göre Türkçe etiketleyen bir istatistik asistanısın.

Aşağıda ${axisName.toUpperCase()} eksenini şekillendiren ilk 3 görüş verilmiştir:

${statementsText}

Görevin: Bu görüşlerin temsil ettiği ana fikri veya karşıtlığı ifade eden 3-5 KELİMELİK tek bir Türkçe başlık yaz (Örnek: "Toplu Taşıma Odaklılık vs Bireysel Araç").

KESİN KURALLAR:
- Yalnızca 3-5 kelimelik başlık metnini yaz.
- Cevabını SADECE şu formatta ver: [CEVAP]buraya nihai cevabını yaz[/CEVAP]`;

  const requestParams = {
    model: modelName,
    messages: [
      { role: 'system', content: 'Sen PCA eksenlerini etiketleyen bir istatistik asistanısın. Cevabını SADECE şu formatta ver:\n[CEVAP]buraya nihai cevabını yaz[/CEVAP]' },
      { role: 'user', content: prompt }
    ],
    max_tokens: 150,
    temperature: 0.3,
  };

  const raw = await executeLlmWithRetry(requestParams, 'axis-label');
  if (raw) {
    const extracted = extractDelimited(raw) || raw;
    const label = sanitizeLLMResponse(extracted, 'axis-label');
    if (label) return label.replace(/^"|"$/g, '');
  }

  return generateAxisFallbackSummary(axisName, topStatements);
}

export function generateAxisFallbackSummary(axisName, topStatements) {
  if (!topStatements || topStatements.length === 0) {
    return axisName === 'x' ? 'Fikir Ayrışması (Boyut 1)' : 'Görüş Ayrışması (Boyut 2)';
  }
  let firstText = (topStatements[0].statement?.text || topStatements[0].text || '').replace(/["']/g, '').trim();
  if (firstText.length > 30) firstText = firstText.substring(0, 27) + '...';
  return `${axisName.toUpperCase()} Ekseni: "${firstText}" Odaklılık`;
}

export function generatePolarizationImpactDescription(impact) {
  const direction = impact >= 0 ? 'azalıyor' : 'artıyor';
  const absImpact = Math.abs(impact).toFixed(1);
  return `Bu görüş çıkarıldığında kutuplaşma derecesi %${absImpact} ${direction}.`;
}

// ========================================================
// 4. CONSENSUS DISCOVERY WITH VERSION-TIED CACHE (Req 1 & Req 2)
// ========================================================
export function generateRuleBasedConsensusFallback(camps, question) {
  if (!camps || camps.length === 0) {
    return `"${question || 'Bu müzakere'}" konusundaki oturumda henüz belirgin bir fikir grubu oluşmamıştır. Katılımcı sayısı arttıkça uzlaşı potansiyelleri analiz edilecektir.`;
  }

  const campNames = camps.map(c => `"${c.name || ('Grup ' + String.fromCharCode(65 + c.id))}"`).join(' ve ');
  const topOpinions = camps
    .flatMap(c => (c.topStatements || []).slice(0, 1))
    .map(st => st.text || st.statement?.text)
    .filter(Boolean);

  let opinionContext = '';
  if (topOpinions.length > 0) {
    opinionContext = `Öne çıkan görüşlerde "${topOpinions[0]}" gibi başlıkların ağırlık kazanması, gruplar arasında diyalog zemininin bulunduğunu göstermektedir. `;
  }

  return `"${question}" konusundaki müzakerede ${camps.length} ana fikir grubu (${campNames}) arasında yapılan analiz sonucunda, temel beklentilerin ortak fayda ve yapıcı çözümler etrafında odaklandığı gözlemlenmektedir. ${opinionContext}Moderatör olarak bu ortak temada yeni bir odak sorusu açarak gruplar arası diyaloğu teşvik edebilirsiniz.`;
}

export async function discoverConsensusPotential(camps, question, sessionCode = 'DEFAULT', version = 1) {
  if (process.env.LLM_DRY_RUN === 'true') {
    logDryRunCall('consensus-discovery');
    return `[DRY-RUN] Ortak Uzlaşı Potansiyeli Özeti ve Süreç Önerisi`;
  }

  const fallbackConsensus = generateRuleBasedConsensusFallback(camps, question);

  const campHashData = (camps || []).map(c => ({
    id: c.id,
    name: c.name,
    size: c.size,
    top: (c.topStatements || []).slice(0, 3).map(s => s.text || s.statement?.text)
  }));
  const cacheKey = `consensus-discovery:${sessionCode}:v${version}`;
  const hash = generateHash({ question, campHashData, version });

  const cached = getFromLlmCache(cacheKey, hash, sessionCode, version);
  if (cached) {
    return cached;
  }

  if (!openaiClient) {
    setInLlmCache(cacheKey, hash, fallbackConsensus);
    return fallbackConsensus;
  }

  const campsDescription = (camps || []).map((camp, idx) => {
    const campLetter = String.fromCharCode(65 + idx);
    const mainOpinions = (camp.topStatements || []).slice(0, 3).map((st) => {
      const text = st.text || st.statement?.text || '';
      return `- "${text}" (Onay: %${st.approvalRate || 0})`;
    }).join('\n');
    return `### Grup ${campLetter}: "${camp.name}" (${camp.size} katılımcı)\nGrup Tanımı: ${camp.summary || 'Belirtilmemiş'}\nÖne Çıkan Görüşler:\n${mainOpinions}`;
  }).join('\n\n');

  const prompt = `Sen müzakere grupları arasındaki ortak uzlaşı alanlarını ve köprü temaları keşfeden profesyonel bir arabulucu asistansın.

Aşağıda, "${question}" konusu etrafında yürütülen müzakerede ortaya çıkan TÜM fikir grupları (kamplar) ve bu grupların en çok desteklediği görüşler verilmiştir:

${campsDescription}

Müzakere Konusu: "${question}"

Görevin:
1. Tüm fikir gruplarının görüşlerini karşılaştırarak, yüzeydeki ayrışmalara rağmen gruplar arasında örtüşebilecek ORTAK ANA TEMAYI veya kaygıyı açıkla.
2. Moderatör için eyleme dönüştürülebilir bir SÜREÇ ÖNERİSİ sun.

KESİN KURALLAR:
- Yeni bir görüş veya uzlaşı cümlesi KESİNLİKLE ÜRETME/YAZMA.
- Yalnızca ortak temayı tarif et ve moderatör için süreç önerisi ver.
- Çıktı doğrudan ve tarafsız bir Türkçe paragraf olmalıdır.`;

  const requestParams = {
    model: modelName,
    messages: [
      { role: 'system', content: 'Sen müzakere grupları arasındaki ortak temaları analiz eden ve moderatör için süreç önerisi sunan tarafsız bir arabulucu asistansın. Yalnızca Türkçe yanıt metnini yaz.' },
      { role: 'user', content: prompt }
    ],
    max_tokens: 1000,
    temperature: 0.4,
  };

  if (process.env.LLM_REASONING_EFFORT) {
    requestParams.reasoning_effort = process.env.LLM_REASONING_EFFORT;
  }

  console.log(`🌐 [LLM CALL] Executing live LLM consensus discovery API call for session ${sessionCode} (v${version})...`);
  const result = await executeLlmWithRetry(requestParams, 'consensus-discovery');
  const finalResult = result || fallbackConsensus;

  setInLlmCache(cacheKey, hash, finalResult);
  return finalResult;
}

// ========================================================
// 5. EXECUTIVE SUMMARY WITH VERSION-TIED CACHE (Req 1 & Req 2)
// ========================================================
function generateRuleBasedExecutiveSummary(data) {
  const {
    question,
    participantsCount,
    statementsCount,
    campsCount,
    camps = [],
    polarisability,
    bridgesCount,
    bridgesText = [],
    participationGini,
    voteCompletionRate
  } = data;

  return `Bu rapor, "${question}" konusu etrafında yürütülen kamusal müzakere oturumunun algoritmik ve istatistiksel bulgularını sunmaktadır. Oturuma toplam ${participantsCount} katılım sağlanmış ve moderasyon sürecinden geçen ${statementsCount} onaylı görüş katılımcıların oylamasına sunulmuştur. Katılımcıların oy tamamlama oranı %${voteCompletionRate !== undefined && voteCompletionRate !== null ? voteCompletionRate : '—'} seviyesinde gerçekleşirken, görüş üretmedeki katılım eşitliği (Gini katsayısı) ${participationGini !== undefined && participationGini !== null ? participationGini : '—'} olarak ölçülmüştür.

Veri analizi sonucunda katılımcıların oy örüntüleri ${campsCount} ana fikir grubunda (kümede) yoğunlaşmıştır. Oturum genelindeki kutuplaşma ve fikir ayrışması derecesi %${polarisability !== null && polarisability !== undefined ? polarisability : '—'} olarak hesaplanmıştır. ${camps.length > 0 ? `Ortaya çıkan fikir grupları şunlardır: ${camps.map(c => c.name).join(', ')}.` : ''}

${bridgesCount > 0 
  ? `Farklı fikir grupları arasında ortak payda oluşturan ${bridgesCount} adet uzlaşı (köprü) görüş tespit edilmiştir. En yüksek mutabakata sahip köprü fikirler şunlardır: ${bridgesText.map(t => `"${t}"`).join('; ')}.`
  : 'Müzakere sürecinde tüm fikir gruplarının üzerinde uzlaştığı ortak bir köprü görüş henüz tespit edilememiştir.'}`;
}

export async function generateExecutiveSummary(data, sessionCode = 'DEFAULT', version = 1) {
  const {
    question,
    participantsCount,
    statementsCount,
    campsCount,
    camps = [],
    polarisability,
    bridgesCount,
    bridgesText = [],
    participationGini,
    voteCompletionRate
  } = data;

  const ruleBasedSummary = generateRuleBasedExecutiveSummary(data);

  const cacheKey = `executive-summary:${sessionCode || 'DEFAULT'}:v${version}`;
  const hash = generateHash({ question, participantsCount, statementsCount, campsCount, polarisability, bridgesCount, bridgesText, participationGini, voteCompletionRate, version });

  const cached = getFromLlmCache(cacheKey, hash, sessionCode, version);
  if (cached) {
    return cached;
  }

  if (process.env.LLM_DRY_RUN === 'true' || !openaiClient) {
    setInLlmCache(cacheKey, hash, ruleBasedSummary);
    return ruleBasedSummary;
  }

  const campsListText = camps.length > 0
    ? camps.map((c, i) => `Grup ${String.fromCharCode(65 + i)} (${c.name || 'Grup ' + (i+1)}): ${c.size || 0} katılımcı${c.summary ? ' - ' + c.summary : ''}`).join('\n')
    : 'Fikir grupları netleşmemiştir.';

  const bridgesList = bridgesText.length > 0
    ? bridgesText.map((txt, i) => `${i + 1}. "${txt}"`).join('\n')
    : 'Tüm gruplarca ortak onaylanan köprü görüş bulunmamaktadır.';

  const prompt = `
Aşağıdaki müzakere verilerini inceleyerek yöneticiler ve karar vericiler için 3 paragraftan oluşan bir Türkçe "Yönetici Özeti" yaz.

--- MÜZAKERE VERİLERİ ---
Müzakere Konusu / Soru: "${question}"
Toplam Katılımcı Sayısı: ${participantsCount}
Onaylanan Görüş Sayısı: ${statementsCount}
Oy Tamamlama Oranı: %${voteCompletionRate !== undefined && voteCompletionRate !== null ? voteCompletionRate : 'Hesaplanamadı'}
Katılım Eşitliği (Gini Katsayısı): ${participationGini !== undefined && participationGini !== null ? participationGini : 'Hesaplanamadı'}

Fikir Grubu (Küme) Sayısı: ${campsCount}
Kutuplaşma Derecesi: %${polarisability !== null && polarisability !== undefined ? polarisability : 'Hesaplanamadı'}
Fikir Grupları Detayı:
${campsListText}

Köprü (Uzlaşı) Görüş Sayısı: ${bridgesCount}
Köprü Görüşler Metni:
${bridgesList}

--- KURALLAR VE FORMAT ---
1. Özeti doğrudan ve kesintisiz 3 paragraf olarak yaz.
2. Cevabını SADECE şu formatta ver: [CEVAP]buraya nihai cevabını yaz[/CEVAP]
`;

  const requestParams = {
    model: modelName,
    messages: [
      { role: 'system', content: 'Sen müzakere özet raporlarına dönüştüren profesyonel bir analiz uzmanısın. Cevabını SADECE şu formatta ver:\n[CEVAP]buraya nihai cevabını yaz[/CEVAP]' },
      { role: 'user', content: prompt }
    ],
    max_tokens: 4000,
    temperature: 0.3,
  };

  if (process.env.LLM_REASONING_EFFORT) {
    requestParams.reasoning_effort = process.env.LLM_REASONING_EFFORT;
  }

  console.log(`🌐 [LLM CALL] Executing live LLM executive summary API call for session ${sessionCode} (v${version})...`);
  const rawResult = await executeLlmWithRetry(requestParams, 'executive-summary');
  let finalResult = ruleBasedSummary;
  if (rawResult) {
    const extracted = extractDelimited(rawResult) || rawResult;
    const sanitized = sanitizeLLMResponse(extracted, 'executive-summary');
    if (sanitized) finalResult = sanitized;
  }

  setInLlmCache(cacheKey, hash, finalResult);
  return finalResult;
}
