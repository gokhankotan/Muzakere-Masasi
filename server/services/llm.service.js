import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

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
    // 1. Eğer markdown kod bloğu (```json ... ``` veya ``` ... ```) varsa doğrudan onu çıkar
    const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch && codeBlockMatch[1]) {
      return codeBlockMatch[1].trim();
    }

    // 2. Paragrafları ayır ve düşünme süreci içermeyen paragrafları bul
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
      // Tüm paragraflar düşünme adımı gibi görünüyorsa, son paragraftaki çift tırnaklı metni veya son satırı dene
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
 * PROJECT_CONSTRAINTS.md Madde 23 uyarınca:
 * Metin içerisinden [CEVAP]...[/CEVAP] etiketleri arasındaki içeriği çıkarır.
 * @param {string} rawText - LLM'den dönen ham yanıt metni
 * @returns {string|null} Etiketler arasındaki kırpılmış metin veya bulunamazsa null
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
 * PROJECT_CONSTRAINTS.md Madde 20 uyarınca:
 * Tüm LLM yanıtlarını doğrulayan ve meta-talimat sızıntılarını engelleyen merkezi doğrulayıcı.
 * @param {string} rawText - LLM'den dönen ham yanıt metni
 * @param {string} callType - Çağrı türü ('cluster-summary' | 'moderation' | 'axis-label' | 'polarization-impact' | 'consensus-discovery' | 'executive-summary')
 * @returns {string|null} Temizlenmiş geçerli metin veya geçersizse null
 */
export function sanitizeLLMResponse(rawText, callType) {
  if (!rawText || typeof rawText !== 'string' || rawText.trim().length === 0) {
    console.warn(`LLM yanıtı geçersiz (boş):`, callType);
    return null;
  }

  // 1. Etiket temizliği (<think>...</think>, <thinking>...</thinking>)
  let cleaned = cleanLLMOutput(rawText);

  if (!cleaned || cleaned.length === 0) {
    console.warn(`LLM yanıtı geçersiz (etiket temizliği sonrası boş):`, callType);
    return null;
  }

  // 2. Meta-talimat / Thinking Process regex tespiti
  const metaRegex = /(Thinking Process|\*\*Role:\*\*|\*\*Input:\*\*|\*\*Input Data:\*\*|\*\*Task:\*\*|Analyze the Request|Drafting|Refining|Revised Draft|Final Output|\*\*Constraints:\*\*|1\.\s*\*\*Analyze|2\.\s*\*\*Draft|3\.\s*\*\*Refine)/i;
  if (metaRegex.test(cleaned)) {
    console.warn(`LLM yanıtı geçersiz (meta-talimat/thinking sızıntısı saptandı):`, callType);
    return null;
  }

  // 3. Çağrı türüne özel biçim ve uzunluk doğrulamaları
  switch (callType) {
    case 'axis-label':
      // Eksen etiketi: Maks 100 karakter, tek satır, liste/madde işareti içermemeli
      if (cleaned.length > 100 || cleaned.includes('\n') || /^[*#-]|^\d+\./.test(cleaned)) {
        console.warn(`LLM yanıtı geçersiz (eksen etiketi format uyuşmazlığı, uzunluk: ${cleaned.length}):`, callType);
        return null;
      }
      break;

    case 'polarization-impact':
      // Kutuplaşma etkisi: Maks 200 karakter, madde işareti içermemeli
      if (cleaned.length > 200 || /^[*#-]|^\d+\./.test(cleaned)) {
        console.warn(`LLM yanıtı geçersiz (kutuplaşma etkisi format uyuşmazlığı, uzunluk: ${cleaned.length}):`, callType);
        return null;
      }
      break;

    case 'cluster-summary':
      // Küme özeti: Maks 350 karakter, madde işareti içermemeli
      if (cleaned.length > 350 || /^[*#-]|^\d+\./.test(cleaned)) {
        console.warn(`LLM yanıtı geçersiz (küme özeti format uyuşmazlığı, uzunluk: ${cleaned.length}):`, callType);
        return null;
      }
      break;

    case 'moderation':
      // Moderasyon: Geçerli JSON ve flagged boolean içermeli
      try {
        let jsonStr = cleaned;
        if (jsonStr.startsWith('```json')) {
          jsonStr = jsonStr.replace(/^```json/, '').replace(/```$/, '').trim();
        } else if (jsonStr.startsWith('```')) {
          jsonStr = jsonStr.replace(/^```/, '').replace(/```$/, '').trim();
        }
        const parsed = JSON.parse(jsonStr);
        if (typeof parsed.flagged !== 'boolean') {
          console.warn(`LLM yanıtı geçersiz (moderasyon JSON flagged eksik/bozuk):`, callType);
          return null;
        }
      } catch (e) {
        console.warn(`LLM yanıtı geçersiz (moderasyon JSON parse hatası):`, callType);
        return null;
      }
      break;

    case 'consensus-discovery':
      // Uzlaşı keşfi: Maks 1000 karakter
      if (cleaned.length > 1000) {
        console.warn(`LLM yanıtı geçersiz (uzlaşı keşfi uzunluk uyuşmazlığı, uzunluk: ${cleaned.length}):`, callType);
        return null;
      }
      break;

    case 'executive-summary':
      // Yönetici özeti: Min 50, maks 2500 karakter
      if (cleaned.length < 50 || cleaned.length > 2500) {
        console.warn(`LLM yanıtı geçersiz (yönetici özeti uzunluk uyuşmazlığı, uzunluk: ${cleaned.length}):`, callType);
        return null;
      }
      break;

    default:
      break;
  }

  return cleaned;
}

let openaiClient = null;

if (apiKey) {
  try {
    openaiClient = new OpenAI({
      apiKey: apiKey,
      baseURL: baseURL || undefined, // Eğer özel bir endpoint varsa (örn. kurumsal API)
    });
  } catch (error) {
    console.warn('OpenAI istemcisi başlatılamadı, fallback modu kullanılacak:', error.message);
  }
}

/**
 * Kural tabanlı (rule-based) yedek özetleyici.
 * LLM erişimi olmadığında veya hata alındığında çalışır.
 */
function generateFallbackSummary(campId, topStatements) {
  if (!topStatements || topStatements.length === 0) {
    return `Grup ${String.fromCharCode(65 + campId)}: Henüz fikir örüntüsü netleşmemiş katılımcılar.`;
  }

  // En yüksek contrastScore veya onay oranına sahip ilk iki ifadeyi seçelim
  const mainStatements = topStatements.slice(0, 2).map(st => {
    // Tırnak işaretlerini temizleyelim ve cümlenin ilk 60 karakterini alalım
    let text = st.text.replace(/["']/g, '').trim();
    if (text.length > 60) {
      text = text.substring(0, 57) + '...';
    }
    return `"${text}"`;
  });

  if (mainStatements.length === 1) {
    return `Bu grup, ağırlıklı olarak ${mainStatements[0]} görüşünü desteklemektedir.`;
  }

  return `Bu grup, öncelikli olarak ${mainStatements[0]} ve ${mainStatements[1]} fikirlerini destekleyen ve bu doğrultuda ortaklaşan katılımcılardan oluşmaktadır.`;
}

/**
 * Bir fikir kümesinin en çok desteklediği görüşleri analiz ederek Türkçe bir özet metni üretir.
 * @param {number|string} campId - Küme ID
 * @param {Array} topStatements - Kümenin en çok onayladığı görüşler dizisi
 * @returns {Promise<string>} 1-2 cümlelik Türkçe küme özeti
 */
export async function generateClusterSummary(campId, topStatements) {
  if (process.env.LLM_DRY_RUN === 'true') {
    logDryRunCall('cluster-summary');
    return `[DRY-RUN] Küme Özeti (Grup ${campId})`;
  }

  // Eğer OpenAI istemcisi yoksa veya hiç görüş yoksa doğrudan fallback çalıştır
  if (!openaiClient || !topStatements || topStatements.length === 0) {
    return generateFallbackSummary(campId, topStatements);
  }

  try {
    const statementsText = topStatements
      .map((st, i) => `${i + 1}. Görüş: "${st.text}" (Onay Oranı: %${st.approvalRate || 0})`)
      .join('\n');

    const prompt = `
Aşağıda, bir müzakere platformunda aynı fikir kümesinde (kampta) yer alan katılımcıların en çok onayladığı görüşler listelenmiştir:

${statementsText}

Görevin: Bu verileri analiz ederek, bu grubun ortak görüşlerini ve duruşunu özetleyen, 1 ya da en fazla 2 cümlelik, akıcı, tarafsız ve profesyonel bir Türkçe grup profili yaz. 
Notlar:
- Asla "Bu grup...", "Özetle...", "1. Görüşe göre..." gibi klişe kalıplarla başlamamaya çalış. Akıcı ve doğrudan bir tanım yap.
- Üçüncü şahıs gözünden (örneğin "Ulaşımda çevreci çözümleri ve yaya haklarını önceliklendiren, bireysel araç kullanımını sınırlandırmayı savunan katılımcılar.") yaz.
- Çıktı sadece 1-2 cümlelik özet metinden oluşmalıdır, başka açıklama ekleme.
`;

    const response = await openaiClient.chat.completions.create({
      model: modelName,
      messages: [
        { role: 'system', content: 'Sen müzakere verilerini ve fikir gruplarını özetleyen tarafsız bir analiz asistanısın.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 150,
      temperature: 0.5,
    });

    const raw = response.choices[0]?.message?.content?.trim();
    const summary = sanitizeLLMResponse(raw, 'cluster-summary');
    if (summary) {
      return summary;
    }

    throw new Error('LLM yanıtı doğrulanamadı veya boş.');
  } catch (err) {
    console.error(`LLM Özet oluşturma hatası (Grup ${campId} için), fallback uygulanıyor:`, err.message);
    return generateFallbackSummary(campId, topStatements);
  }
}

/**
 * Kural tabanlı yerel denetleyici (Regex Fallback).
 * LLM çalışmadığında temel spam, bağlantı adresi ve yaygın küfürleri tespit eder.
 */
function evaluateOpinionFallback(text) {
  const cleanText = text.toLowerCase().trim();

  // 1. Link / URL Tespiti
  const urlPattern = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-z0-9]+\.(com|net|org|edu|gov|mil|info|biz|co|io|xyz|info|tr|us|uk|de|ru|asia|online|site|app|dev))/i;
  if (urlPattern.test(cleanText)) {
    return { flagged: true, reason: 'Reklam veya spam bağlantı adresi içeriyor olabilir.' };
  }

  // 2. Çok kısa / Rastgele Karakter Tespiti (Örn: "asdasdasd", "qwerty")
  if (cleanText.length < 5) {
    return { flagged: true, reason: 'Görüş metni çok kısa veya anlamsız.' };
  }
  const randomPattern = /(asdasd|qwert|sdfgh|zxcvb|yhnjm)/;
  if (randomPattern.test(cleanText)) {
    return { flagged: true, reason: 'Anlamsız karakter dizisi (spam) içeriyor olabilir.' };
  }

  // 3. Yaygın Türkçe küfür ve hakaret filtrelemesi (Temel düzeyde)
  const badWords = ['siktir', 'sikik', 'orospu', 'amk', 'aq', 'picoğlu', 'göt', 'şerefsiz', 'amına', 'yavşak', 'ibne', 'piç', 'aptal', 'salak', 'gerizekalı', 'amguard', 'orospuçocuğu'];
  for (const word of badWords) {
    // Kelime sınırı kontrolü veya doğrudan içerme
    if (cleanText.includes(word)) {
      return { flagged: true, reason: 'Hakaret veya uygunsuz dil (küfür/argo) içeriyor olabilir.' };
    }
  }

  return { flagged: false, reason: null };
}

/**
 * Gönderilen görüşü yapay zeka veya kural motoruyla tarayıp uyarı gerekçesi üretir.
 * @param {string} text - Görüş metni
 * @param {string} question - Masanın aktif sorusu (konu uyumluluğu için)
 * @returns {Promise<{flagged: boolean, reason: string|null}>}
 */
export async function evaluateOpinionContent(text, question) {
  if (process.env.LLM_DRY_RUN === 'true') {
    logDryRunCall('moderation');
    return { flagged: false, reason: null };
  }

  if (!text || text.trim().length === 0) {
    return { flagged: true, reason: 'Görüş metni boş olamaz.' };
  }

  // OpenAI istemcisi yoksa doğrudan kural motoruna yönlendir
  if (!openaiClient) {
    return evaluateOpinionFallback(text);
  }

  try {
    const prompt = `
Aşağıdaki görüşün uygunluğunu müzakere konusu çerçevesinde değerlendir.

Müzakere Konusu/Sorusu: "${question}"
Gönderilen Görüş: "${text}"

Görevin: Bu görüşü 4 ana kritere göre değerlendir:
1. Hakaret, küfür, nefret söylemi veya saldırgan bir üslup var mı?
2. Reklam, spam, anlamsız karakter dizileri (örn. "asdasd") veya ilgisiz bağlantılar içeriyor mu?
3. Konuyla tamamen alakasız mı? (Örneğin bisiklet yolları konuşulurken futbol maçı sonucu yazmak). Not: Karşıt veya radikal fikirler konuyla alakalı olduğu sürece kesinlikle FLAGGED YAPILMAMALIDIR. İfade özgürlüğüne saygı duyulmalıdır.
4. Çok kısa veya tamamen anlamsız bir kelimeden mi ibaret?

Yanıt Formatı:
Sadece geçerli bir JSON objesi döndür. Başka hiçbir açıklama, markdown işareti veya kod bloğu ekleme.
Örnek Yanıt formatı:
{"flagged": true, "reason": "Buraya kısa bir Türkçe gerekçe yazın (max 10 kelime)."}
Eğer görüş tamamen uygunsa:
{"flagged": false, "reason": null}
`;

    const response = await openaiClient.chat.completions.create({
      model: modelName,
      messages: [
        { role: 'system', content: 'Sen müzakere görüşlerini denetleyen, sadece JSON formatında yanıt veren objektif bir moderatör yardımcısısın.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 100,
      temperature: 0.1, // Düşük sıcaklık daha kararlı JSON çıktısı sağlar
    });

    const content = response.choices[0]?.message?.content?.trim();
    const sanitized = sanitizeLLMResponse(content, 'moderation');
    if (!sanitized) {
      return evaluateOpinionFallback(text);
    }
    
    let jsonStr = sanitized;
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```/, '').replace(/```$/, '').trim();
    }

    const result = JSON.parse(jsonStr);
    return {
      flagged: !!result.flagged,
      reason: result.reason || null
    };

  } catch (err) {
    console.warn('AI Görüş analizinde hata oluştu, fallback kural motoru devreye giriyor:', err.message);
    return evaluateOpinionFallback(text);
  }
}

/**
 * PCA eksenini şekillendiren en yüksek ağırlıklı ilk 3 görüş üzerinden Türkçe eksen etiketi üretir.
 * @param {string} axisName - 'x' veya 'y'
 * @param {Array} topStatements - En yüksek loading değerine sahip 3 görüş ({ statement, loading })
 * @returns {Promise<string>} Kısa Türkçe etiket metni
 */
export async function generateAxisLabel(axisName, topStatements) {
  if (process.env.LLM_DRY_RUN === 'true') {
    logDryRunCall('axis-label');
    return `[DRY-RUN] Eksen ${axisName.toUpperCase()} Etiketi`;
  }

  // Eğer OpenAI istemcisi yoksa veya hiç görüş yoksa doğrudan fallback çalıştır
  if (!openaiClient || !topStatements || topStatements.length === 0) {
    return generateAxisFallbackSummary(axisName, topStatements);
  }

  try {
    const statementsText = topStatements
      .map((st, i) => `${i + 1}. Görüş: "${st.statement.text}" (Yük Ağırlığı: ${st.loading.toFixed(3)})`)
      .join('\n');

    const prompt = `Sen PCA eksenlerini temsil ettikleri ana fikre göre Türkçe etiketleyen bir istatistik asistanısın.

Aşağıda ${axisName.toUpperCase()} eksenini şekillendiren ilk 3 görüş verilmiştir:

${statementsText}

Görevin: Bu görüşlerin temsil ettiği ana fikri veya karşıtlığı ifade eden 3-5 KELİMELİK tek bir Türkçe başlık yaz (Örnek: "Toplu Taşıma Odaklılık vs Bireysel Araç").

KESİN KURALLAR:
- Yalnızca 3-5 kelimelik başlık metnini yaz.
- Başlık, "1. 2." gibi numaralandırma veya düşünme adımı ekleme.
- Cevabını SADECE şu formatta ver, öncesinde veya sonrasında BAŞKA HİÇBİR METİN (açıklama, düşünme süreci, taslak) yazma:
[CEVAP]buraya nihai cevabını yaz[/CEVAP]`;

    const systemPrompt = 'Sen PCA eksenlerini temsil ettikleri ana fikre göre Türkçe etiketleyen bir istatistik asistanısın. Cevabını SADECE şu formatta ver, öncesinde veya sonrasında BAŞKA HİÇBİR METİN (açıklama, düşünme süreci, taslak) yazma:\n[CEVAP]buraya nihai cevabını yaz[/CEVAP]';

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await openaiClient.chat.completions.create({
          model: modelName,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          max_tokens: 4000,
          temperature: 0.3,
        });

        const raw = response.choices[0]?.message?.content?.trim();
        const extracted = extractDelimited(raw);
        if (extracted) {
          const label = sanitizeLLMResponse(extracted, 'axis-label');
          if (label) {
            console.log(`[#3 generateAxisLabel] Deneme ${attempt}/${maxAttempts} başarılı!`);
            return label.replace(/^"|"$/g, '');
          }
        }
        console.warn(`[#3 generateAxisLabel] Deneme ${attempt}/${maxAttempts} başarısız (etiket bulunamadı veya doğrulanamadı).`);
      } catch (callErr) {
        console.warn(`[#3 generateAxisLabel] Deneme ${attempt}/${maxAttempts} API hatası:`, callErr.message);
      }

      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 400));
      }
    }

    throw new Error('LLM eksen etiketi 3 denemede de doğrulanamadı.');
  } catch (err) {
    console.error(`LLM eksen etiketi oluşturma hatası (${axisName} için), fallback uygulanıyor:`, err.message);
    return generateAxisFallbackSummary(axisName, topStatements);
  }
}

function generateAxisFallbackSummary(axisName, topStatements) {
  if (!topStatements || topStatements.length === 0) {
    return axisName === 'x' ? 'Fikir Ayrışması (Boyut 1)' : 'Görüş Ayrışması (Boyut 2)';
  }
  // En yüksek yüke sahip ilk görüşü kısaltıp gösterelim
  let firstText = topStatements[0].statement.text.replace(/["']/g, '').trim();
  if (firstText.length > 30) {
    firstText = firstText.substring(0, 27) + '...';
  }
  return `${axisName.toUpperCase()} Ekseni: "${firstText}" Odaklılık`;
}

/**
 * Bir görüş çıkarıldığında kutuplaşma derecesindeki değişimi Türkçe cümle olarak açıklar.
 * @param {number} impact - Kutuplaşmaya olan sayısal etki (fark)
 * @returns {Promise<string>}
 */
export function generatePolarizationImpactDescription(impact) {
  // LLM çağrısı kaldırıldı: üretilen cümle zaten fallback ile özdeşti ve
  // büyük oturumlarda (500+ katılımcı × N statement) ciddi gecikmeye yol açıyordu.
  const direction = impact >= 0 ? 'azalıyor' : 'artıyor';
  const absImpact = Math.abs(impact).toFixed(1);
  return `Bu görüş çıkarıldığında kutuplaşma derecesi %${absImpact} ${direction}.`;
}

/**
 * Fikir gruplarının en çok desteklediği görüşleri ve özetlerini analiz ederek ortak uzlaşı temalarını keşfeder.
 * @param {Array} camps - Fikir grupları verisi
 * @param {string} question - Müzakere ana sorusu
 * @returns {Promise<string>}
 */
export async function discoverConsensusPotential(camps, question) {
  if (process.env.LLM_DRY_RUN === 'true') {
    logDryRunCall('consensus-discovery');
    return `[DRY-RUN] Ortak Uzlaşı Potansiyeli Özeti ve Süreç Önerisi`;
  }

  const fallbackConsensus = `Müzakere sürecinde grupların öne çıkan fikirleri incelendiğinde, temel ortak kaygıların şehir altyapısının geliştirilmesi ve erişilebilirliğin artırılması etrafında toplandığı gözlemlenmektedir. Moderatör olarak bu ortak temada yeni bir odak sorusu açarak gruplar arası diyaloğu teşvik edebilirsiniz.`;

  if (!openaiClient) {
    return fallbackConsensus;
  }

  try {
    const campsDescription = camps.map((camp, idx) => {
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
2. Moderatör için eyleme dönüştürülebilir bir SÜREÇ ÖNERİSİ sun (Örn: "Moderatör olarak bu ortak temada yeni bir odak sorusu açmayı değerlendirebilirsiniz.").

KESİN KURALLAR:
- Yeni bir görüş veya uzlaşı cümlesi KESİNLİKLE ÜRETME/YAZMA. Katılımcıların oy vermesi için somut bir uzlaşı metni dayatma.
- Yalnızca ortak temayı tarif et ve moderatör için süreç önerisi ver.
- Çıktı doğrudan ve tarafsız bir Türkçe paragraf olmalıdır. Başlık, "1. 2." gibi numaralandırma veya düşünme adımı ekleme.`;

    const response = await openaiClient.chat.completions.create({
      model: modelName,
      messages: [
        { role: 'system', content: 'Sen müzakere grupları arasındaki ortak temaları analiz eden ve moderatör için süreç önerisi sunan tarafsız bir arabulucu asistansın. Yalnızca Türkçe yanıt metnini yaz.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1000,
      temperature: 0.4,
    });

    const raw = response.choices[0]?.message?.content?.trim();
    const result = sanitizeLLMResponse(raw, 'consensus-discovery');
    if (result) {
      return result;
    }
    return fallbackConsensus;
  } catch (err) {
    console.error('LLM Uzlaşı Potansiyeli Keşif Hatası, kural tabanlı öneri kullanılıyor:', err.message);
    return fallbackConsensus;
  }
}

/**
 * Rapor için LLM tabanlı bir Yönetici Özeti üretir.
 * @param {Object} data - Hesaplanan istatistiksel veriler
 * @returns {Promise<string>} 3-5 cümlelik nötr Türkçe özet
 */
export async function generateExecutiveSummary(data) {
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

  const campsListText = camps.length > 0
    ? camps.map((c, i) => `Grup ${String.fromCharCode(65 + i)} (${c.name || 'Grup ' + (i+1)}): ${c.size || 0} katılımcı${c.summary ? ' - ' + c.summary : ''}`).join('\n')
    : 'Fikir grupları netleşmemiştir.';

  const ruleBasedSummary = `Bu rapor, "${question}" konusu etrafında yürütülen kamusal müzakere oturumunun algoritmik ve istatistiksel bulgularını sunmaktadır. Oturuma toplam ${participantsCount} katılım sağlanmış ve moderasyon sürecinden geçen ${statementsCount} onaylı görüş katılımcıların oylamasına sunulmuştur. Katılımcıların oy tamamlama oranı %${voteCompletionRate !== undefined && voteCompletionRate !== null ? voteCompletionRate : '—'} seviyesinde gerçekleşirken, görüş üretmedeki katılım eşitliği (Gini katsayısı) ${participationGini !== undefined && participationGini !== null ? participationGini : '—'} olarak ölçülmüştür.

Veri analizi sonucunda katılımcıların oy örüntüleri ${campsCount} ana fikir grubunda (kümede) yoğunlaşmıştır. Oturum genelindeki kutuplaşma ve fikir ayrışması derecesi %${polarisability !== null && polarisability !== undefined ? polarisability : '—'} olarak hesaplanmıştır. ${camps.length > 0 ? `Ortaya çıkan fikir grupları şunlardır: ${camps.map(c => c.name).join(', ')}.` : ''}

${bridgesCount > 0 
  ? `Farklı fikir grupları arasında ortak payda oluşturan ${bridgesCount} adet uzlaşı (köprü) görüş tespit edilmiştir. En yüksek mutabakata sahip köprü fikirler şunlardır: ${bridgesText.map(t => `"${t}"`).join('; ')}.`
  : 'Müzakere sürecinde tüm fikir gruplarının üzerinde uzlaştığı ortak bir köprü görüş henüz tespit edilememiştir.'}`;

  if (process.env.LLM_DRY_RUN === 'true') {
    logDryRunCall('executive-summary');
    return `[DRY-RUN]\n${ruleBasedSummary}`;
  }

  if (!openaiClient) {
    return ruleBasedSummary;
  }

  try {
    const bridgesList = bridgesText.length > 0
      ? bridgesText.map((txt, i) => `${i + 1}. "${txt}"`).join('\n')
      : 'Tüm gruplarca ortak onaylanan köprü görüş bulunmamaktadır.';

    const prompt = `
Aşağıdaki müzakere verilerini inceleyerek yöneticiler ve karar vericiler için son derece net, detaylı, akıcı, profesyonel ve 3 paragraftan oluşan bir Türkçe "Yönetici Özeti" (Executive Summary) yaz.

--- MÜZAKERE VERİLERİ ---
Müzakere Konusu / Soru: "${question}"
Toplam Katılımcı Sayısı: ${participantsCount}
Onaylanan Görüş Sayısı: ${statementsCount}
Oy Tamamlama Oranı: %${voteCompletionRate !== undefined && voteCompletionRate !== null ? voteCompletionRate : 'Hesaplanamadı'}
Katılım Eşitliği (Gini Katsayısı): ${participationGini !== undefined && participationGini !== null ? participationGini : 'Hesaplanamadı'} (0=Tam Eşitlik, 1=Yüksek Eşitsizlik)

Fikir Grubu (Küme) Sayısı: ${campsCount}
Kutuplaşma Derecesi: %${polarisability !== null && polarisability !== undefined ? polarisability : 'Hesaplanamadı'}
Fikir Grupları Detayı:
${campsListText}

Köprü (Uzlaşı) Görüş Sayısı: ${bridgesCount}
Köprü Görüşler Metni:
${bridgesList}

--- KURALLAR VE FORMAT ---
1. Özeti doğrudan ve kesintisiz 3 paragraf olarak yaz (1. Paragraf: katılım dengesi, 2. Paragraf: fikir grupları ve kutuplaşma, 3. Paragraf: köprü görüşler).
2. Taslak hazırlama (drafting), iyileştirme (refining), düşünme adımları veya "1. Paragraf:" gibi başlıklar KESİNLİKLE yazma.
3. Dili akademik, profesyonel, tarafsız ve kolay anlaşılır olsun.
4. Cevabını SADECE şu formatta ver, öncesinde veya sonrasında BAŞKA HİÇBİR METİN (açıklama, düşünme süreci, taslak) yazma:
[CEVAP]buraya nihai cevabını yaz[/CEVAP]
`;

    const systemPrompt = 'Sen müzakere verilerini yöneticiler için akıcı, detaylı ve 3 paragraflı Türkçe özet raporlara dönüştüren profesyonel bir analiz uzmanısın. Cevabını SADECE şu formatta ver, öncesinde veya sonrasında BAŞKA HİÇBİR METİN (açıklama, düşünme süreci, taslak) yazma:\n[CEVAP]buraya nihai cevabını yaz[/CEVAP]';

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await openaiClient.chat.completions.create({
          model: modelName,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          max_tokens: 4000,
          temperature: 0.3,
        });

        const raw = response.choices[0]?.message?.content?.trim();
        const extracted = extractDelimited(raw);
        if (extracted) {
          const summary = sanitizeLLMResponse(extracted, 'executive-summary');
          if (summary) {
            console.log(`[#6 generateExecutiveSummary] Deneme ${attempt}/${maxAttempts} başarılı!`);
            return summary;
          }
        }
        console.warn(`[#6 generateExecutiveSummary] Deneme ${attempt}/${maxAttempts} başarısız (etiket bulunamadı veya doğrulanamadı).`);
      } catch (callErr) {
        console.warn(`[#6 generateExecutiveSummary] Deneme ${attempt}/${maxAttempts} API hatası:`, callErr.message);
      }

      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 400));
      }
    }

    throw new Error('LLM yönetici özeti 3 denemede de doğrulanamadı.');
  } catch (err) {
    console.error('Yönetici Özeti LLM çağrısı başarısız oldu, kural tabanlı özet kullanılıyor:', err.message);
    return ruleBasedSummary;
  }
}





