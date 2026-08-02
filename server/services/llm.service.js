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
// 1. IN-MEMORY RESULT CACHING LAYER (Req 1)
// ==========================================
const llmCache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 Saatlik varsayılan önbellek süresi

function generateHash(data) {
  return crypto.createHash('sha256').update(typeof data === 'string' ? data : JSON.stringify(data)).digest('hex');
}

export function getFromLlmCache(key, hash) {
  const cached = llmCache.get(key);
  if (cached) {
    if (Date.now() - cached.timestamp < CACHE_TTL_MS && cached.hash === hash) {
      console.log(`⚡ [LLM CACHE HIT] Served from cache for key: ${key}`);
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

export function invalidateLlmCache(key) {
  if (key) {
    llmCache.delete(key);
    console.log(`🧹 [LLM CACHE INVALIDATED] Removed cache for key: ${key}`);
  } else {
    llmCache.clear();
    console.log(`🧹 [LLM CACHE CLEARED] Removed all LLM cache entries`);
  }
}

// =======================================================
// 2. EXPONENTIAL BACKOFF & MODEL VALIDATION (Req 4 & 5)
// =======================================================
async function executeLlmWithRetry(requestParams, callType, maxRetries = 2) {
  if (!openaiClient) return null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await openaiClient.chat.completions.create(requestParams);
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

      // Requirement 5: Model 404 / 401 Sanity & Non-retryable error detection
      const is404 = status === 404 || message.includes('404') || message.toLowerCase().includes('not found');
      const is401 = status === 401 || message.includes('401') || message.toLowerCase().includes('unauthorized');

      if (is404) {
        console.error(`❌ [LLM 404 NOT FOUND ERROR] Model '${modelName}' or endpoint '${baseURL || 'default'}' returned 404 Not Found. Please check LLM_MODEL_NAME and LLM_BASE_URL. Non-retryable error. Falling back immediately.`);
        return null;
      }
      if (is401) {
        console.error(`❌ [LLM 401 UNAUTHORIZED ERROR] Invalid API Key or Unauthorized endpoint. Non-retryable error. Falling back immediately.`);
        return null;
      }

      console.warn(`⚠️ [LLM RETRY ${attempt + 1}/${maxRetries + 1}] ${callType} API Error (Status: ${status || 'N/A'}): ${message}`);
      
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

/**
 * Qwen/DeepSeek gibi "düşünen" modellerin yanıtından <think>...</think>
 * bloklarını, 'Thinking Process:' metinlerini ve numaralandırılmış analiz adımlarını temizler.
 */
function cleanLLMOutput(text) {
  if (!text) return '';
  let cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .trim();

  // Düşünme adımlarını/bloklarını temizle
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

/**
 * Metin içerisinden [CEVAP]...[/CEVAP] etiketleri arasındaki içeriği çıkarır.
 */
export function extractDelimited(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;
  const match = rawText.match(/\[CEVAP\]([\s\S]*?)\[\/CEVAP\]/i);
  if (match && match[1]) {
    const extracted = match[1].trim();
    return extracted.length > 0 ? extracted : null;
  }
  return null;
}

/**
 * Tüm LLM yanıtlarını doğrulayan ve meta-talimat sızıntılarını engelleyen merkezi doğrulayıcı.
 */
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

/**
 * Kural tabanlı (rule-based) yedek özetleyici.
 */
function generateFallbackSummary(campId, topStatements) {
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
// 3. BATCHED CLUSTER SUMMARY GENERATION (Req 2 & Req 1 Cache)
// ========================================================
export async function generateAllClusterSummaries(camps, question = '', sessionCode = 'DEFAULT') {
  if (!camps || camps.length === 0) return {};

  const campHashData = camps.map(c => ({
    id: c.id,
    name: c.name,
    top: (c.topStatements || []).slice(0, 3).map(st => st.text || st.statement?.text)
  }));
  const cacheKey = `cluster-summaries:${sessionCode}`;
  const hash = generateHash({ question, campHashData });

  const cached = getCache(cacheKey, hash);
  if (cached) return cached;

  if (!openaiClient || process.env.LLM_DRY_RUN === 'true') {
    const fallbacks = {};
    camps.forEach(c => {
      fallbacks[c.id] = generateFallbackSummary(c.id, c.topStatements);
    });
    setCache(cacheKey, hash, fallbacks);
    return fallbacks;
  }

  const promptClusters = camps.map((c, i) => {
    const topSts = (c.topStatements || []).slice(0, 3).map(st => `  - "${st.text || st.statement?.text}" (%${st.approvalRate || 0})`).join('\n');
    return `Grup ID ${c.id} ("${c.name || 'Grup ' + String.fromCharCode(65 + i)}"):\n${topSts}`;
  }).join('\n\n');

  const prompt = `Aşağıda "${question}" konusundaki kamusal müzakere oturumunda yer alan TÜM fikir grupları ve en çok destekledikleri görüşler verilmiştir:

${promptClusters}

Görevin: Her bir fikir grubu için 1-2 cümlelik tarafsız Türkçe profil özeti üret.
Çıktıyı SADECE aşağıdaki JSON formatında ver, başka hiçbir metin veya açıklama ekleme:
{
  "summaries": [
    { "campId": 0, "summary": "..." },
    { "campId": 1, "summary": "..." }
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

  console.log(`🌐 [LLM BATCH CALL] Requesting all ${camps.length} cluster summaries in 1 batched API request for session ${sessionCode}...`);
  const rawResult = await executeLlmWithRetry(requestParams, 'cluster-summary');
  
  const resultMap = {};
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

  // Ensure every camp has a summary (fallback if missing)
  camps.forEach(c => {
    if (!resultMap[c.id]) {
      resultMap[c.id] = generateFallbackSummary(c.id, c.topStatements);
    }
  });

  setCache(cacheKey, hash, resultMap);
  return resultMap;
}

/**
 * Tekli Küme Özeti (Geriye Dönük Uyumluluk Wrappper)
 */
export async function generateClusterSummary(campId, topStatements, question = '', sessionCode = 'DEFAULT') {
  if (process.env.LLM_DRY_RUN === 'true') {
    logDryRunCall('cluster-summary');
    return `[DRY-RUN] Küme Özeti (Grup ${campId})`;
  }

  const singleCacheKey = `single-cluster-summary:${sessionCode}:${campId}`;
  const hash = generateHash({ question, topStatements: (topStatements || []).slice(0, 3).map(s => s.text) });
  const cached = getCache(singleCacheKey, hash);
  if (cached) return cached;

  const batched = await generateAllClusterSummaries([{ id: campId, topStatements }], question, sessionCode);
  const result = batched[campId] || generateFallbackSummary(campId, topStatements);
  setCache(singleCacheKey, hash, result);
  return result;
}

/**
 * Moderasyon Taraması
 */
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

/**
 * Eksen Etiketi Üretimi
 */
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

function generateAxisFallbackSummary(axisName, topStatements) {
  if (!topStatements || topStatements.length === 0) {
    return axisName === 'x' ? 'Fikir Ayrışması (Boyut 1)' : 'Görüş Ayrışması (Boyut 2)';
  }
  let firstText = topStatements[0].statement.text.replace(/["']/g, '').trim();
  if (firstText.length > 30) firstText = firstText.substring(0, 27) + '...';
  return `${axisName.toUpperCase()} Ekseni: "${firstText}" Odaklılık`;
}

export function generatePolarizationImpactDescription(impact) {
  const direction = impact >= 0 ? 'azalıyor' : 'artıyor';
  const absImpact = Math.abs(impact).toFixed(1);
  return `Bu görüş çıkarıldığında kutuplaşma derecesi %${absImpact} ${direction}.`;
}

// ========================================================
// 4. CONSENSUS DISCOVERY WITH CACHING (Req 1 & Req 4)
// ========================================================
function generateRuleBasedConsensusFallback(camps, question) {
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

export async function discoverConsensusPotential(camps, question, sessionCode = 'DEFAULT') {
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
  const cacheKey = `consensus-discovery:${sessionCode}`;
  const hash = generateHash({ question, campHashData });

  const cached = getCache(cacheKey, hash);
  if (cached) {
    return cached;
  }

  if (!openaiClient) {
    setCache(cacheKey, hash, fallbackConsensus);
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

  console.log(`🌐 [LLM CALL] Executing live LLM consensus discovery API call for session ${sessionCode}...`);
  const result = await executeLlmWithRetry(requestParams, 'consensus-discovery');
  const finalResult = result || fallbackConsensus;

  setCache(cacheKey, hash, finalResult);
  return finalResult;
}

// ========================================================
// 5. EXECUTIVE SUMMARY WITH CACHING (Req 1 & Req 4)
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

export async function generateExecutiveSummary(data, sessionCode = 'DEFAULT') {
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

  const cacheKey = `executive-summary:${sessionCode || 'DEFAULT'}`;
  const hash = generateHash({ question, participantsCount, statementsCount, campsCount, polarisability, bridgesCount, bridgesText, participationGini, voteCompletionRate });

  const cached = getCache(cacheKey, hash);
  if (cached) {
    return cached;
  }

  if (process.env.LLM_DRY_RUN === 'true' || !openaiClient) {
    setCache(cacheKey, hash, ruleBasedSummary);
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

  console.log(`🌐 [LLM CALL] Executing live LLM executive summary API call for session ${sessionCode}...`);
  const rawResult = await executeLlmWithRetry(requestParams, 'executive-summary');
  let finalResult = ruleBasedSummary;
  if (rawResult) {
    const extracted = extractDelimited(rawResult) || rawResult;
    const sanitized = sanitizeLLMResponse(extracted, 'executive-summary');
    if (sanitized) finalResult = sanitized;
  }

  setCache(cacheKey, hash, finalResult);
  return finalResult;
}

// Helper aliases to maintain getCache / setCache inside function bodies
function getCache(key, hash) {
  return getFromLlmCache(key, hash);
}

function setCache(key, hash, result) {
  setInLlmCache(key, hash, result);
}
