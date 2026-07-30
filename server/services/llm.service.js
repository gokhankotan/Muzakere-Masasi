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
 * bloklarını ve boş satırları temizler.
 */
function cleanLLMOutput(text) {
  if (!text) return '';
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^[\s\n]+/, '')
    .replace(/[\s\n]+$/, '')
    .trim();
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
    const summary = cleanLLMOutput(raw);
    if (summary) {
      return summary;
    }

    throw new Error('LLM boş yanıt döndürdü.');
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
    
    // JSON parse etmeye çalışalım, regex ile JSON bloklarını temizleyelim
    let jsonStr = content;
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

    const prompt = `
Aşağıda, bir müzakere platformunda yapılan Temel Bileşenler Analizi (PCA) sonucunda ${axisName.toUpperCase()} ekseninin (boyutunun) şekillenmesinde en yüksek etkiye (ağırlığa) sahip olan ilk 3 görüş listelenmiştir:

${statementsText}

Görevin: Bu 3 görüşün ortak temasını, bu eksen üzerinde katılımcıların hangi temel ayrım veya kutuplaşma (örneğin "Bireysel araç sahipliği vs. Toplu taşıma desteği" ya da "Maliyet kaygıları vs. Çevre duyarlılığı") etrafında konumlandığını özetleyen çok kısa, maksimum 5-6 kelimelik, net bir Türkçe başlık/etiket yaz.
Notlar:
- Başlangıç kelimeleri "Bu eksen...", "Özetle...", "Ayrım..." olmamalıdır. Doğrudan ekseni niteleyen kelime grubunu yaz (örn: "Toplu Taşıma Odaklılık vs Bireysel Araç").
- Çıktı sadece bu etiket metninden oluşmalıdır, başka açıklama veya tırnak işareti ekleme.
`;

    const response = await openaiClient.chat.completions.create({
      model: modelName,
      messages: [
        { role: 'system', content: 'Sen PCA eksenlerini temsil ettikleri ana fikre göre Türkçe etiketleyen bir istatistik asistanısın.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 50,
      temperature: 0.3,
    });

    const raw = response.choices[0]?.message?.content?.trim();
    const label = cleanLLMOutput(raw).replace(/^"|"$/g, '');
    if (label) {
      return label;
    }
    throw new Error('LLM boş yanıt döndürdü.');
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
export async function generatePolarizationImpactDescription(impact) {
  if (process.env.LLM_DRY_RUN === 'true') {
    logDryRunCall('polarization-impact');
    return `[DRY-RUN] Kutuplaşma Etkisi: %${impact.toFixed(1)}`;
  }

  const direction = impact >= 0 ? 'azalıyor' : 'artıyor';
  const absImpact = Math.abs(impact).toFixed(1);
  const fallbackSentence = `Bu görüş çıkarıldığında kutuplaşma derecesi %${absImpact} ${direction}.`;

  if (!openaiClient) {
    return fallbackSentence;
  }

  try {
    const prompt = `Aşağıdaki analiz verisini nötr bir Türkçe cümle olarak ifade et.
Görüş çıkarıldığında kutuplaşma derecesinin yüzde kaç değiştiğini belirt.
Veri: Kutuplaşma derecesi %${absImpact} oranında ${direction}.
Kurallar:
- Asla ek bir yorum veya açıklama ekleme.
- Cümle tam olarak şu şablona sahip olmalıdır: "Bu görüş çıkarıldığında kutuplaşma derecesi %${absImpact} ${direction}."
- Başka hiçbir metin veya açıklama ekleme.`;

    const response = await openaiClient.chat.completions.create({
      model: modelName,
      messages: [
        { role: 'system', content: 'Sen sadece belirtilen formatta net Türkçe cümle üreten bir asistansın.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 50,
      temperature: 0.1,
    });

    const result = response.choices[0]?.message?.content?.trim();
    if (result) {
      return result;
    }
    return fallbackSentence;
  } catch (err) {
    console.warn('AI polarization impact description generation failed, using fallback:', err.message);
    return fallbackSentence;
  }
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
    return `[DRY-RUN] Ortak Uzlaşı Potansiyeli Özeti`;
  }

  if (!openaiClient) {
    throw new Error('LLM client not available');
  }

  try {
    const campsDescription = camps.map((camp) => {
      const mainOpinions = camp.topStatements.slice(0, 3).map((st) => `- "${st.text}" (Onay: %${st.approvalRate})`).join('\n');
      return `### Grup: "${camp.name}" (Katılımcı: ${camp.size} kişi)\nGrup Tanımı: ${camp.summary || 'Belirtilmemiş'}\nÖne Çıkan Görüşleri:\n${mainOpinions}`;
    }).join('\n\n');

    const prompt = `Aşağıda, "${question}" konusu etrafında yürütülen bir müzakerede ortaya çıkan farklı fikir grupları (kamplar) ve bu grupların en çok desteklediği görüşler listelenmiştir:

${campsDescription}

Müzakere Konusu: "${question}"

Görevin: Bu kamplar yüzeyde farklı çözümler önerse de, ortak bir endişe, kaygı veya tema etrafında birleşebilecekleri bir nokta (uzlaşı potansiyeli) var mı? Varsa, 2-3 cümleyle, son derece tarafsız, yapıcı ve doğrudan bir Türkçe ile açıkla.
Kurallar:
- Katılımcıların oy vermesi için yeni bir görüş (Opinion) Kesinlikle ÜRETME / YAZMA.
- Sadece ortaklaşabilecekleri ana temayı, ortak kaygıyı veya birleştirici fikri tarif et.
- Yanıtınız son derece profesyonel, yapıcı ve doğrudan olmalıdır. Başka hiçbir açıklama veya ekleme yapma.`;

    const response = await openaiClient.chat.completions.create({
      model: modelName,
      messages: [
        { role: 'system', content: 'Sen gruplar arası ortak uzlaşı alanlarını ve köprü temaları keşfeden profesyonel bir arabulucu asistansın.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 250,
      temperature: 0.5,
    });

    const result = response.choices[0]?.message?.content?.trim();
    if (result) {
      return result;
    }
    throw new Error('LLM boş yanıt döndürdü.');
  } catch (err) {
    console.error('LLM Uzlaşı Potansiyeli Keşif Hatası:', err.message);
    throw err;
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
    polarisability,
    bridgesCount,
    bridgesText = [],
    participationGini,
    voteCompletionRate
  } = data;

  const ruleBasedSummary = `Bu raporda, "${question}" konusu üzerine gerçekleştirilen müzakere oturumunda ${participantsCount} katılımcının katılımı ve ${statementsCount} onaylı görüş incelenmiştir. Oturum sonucunda katılımcılar ${campsCount} ana fikir grubuna ayrışmış olup, kutuplaşma derecesi %${polarisability !== null && polarisability !== undefined ? polarisability : '—'} olarak hesaplanmıştır. Oturumda toplam ${bridgesCount} adet uzlaşı/köprü görüş tespit edilmiştir. Katılım eşitliği (Gini katsayısı) ${participationGini !== undefined ? participationGini : '—'} ve oy tamamlama oranı %${voteCompletionRate !== undefined ? voteCompletionRate : '—'} düzeyindedir.`;

  if (process.env.LLM_DRY_RUN === 'true') {
    logDryRunCall('executive-summary');
    return `[DRY-RUN] ${ruleBasedSummary}`;
  }

  if (!openaiClient) {
    return ruleBasedSummary;
  }

  try {
    const bridgesList = bridgesText.length > 0
      ? bridgesText.map((txt, i) => `${i + 1}. "${txt}"`).join('\n')
      : 'Ulaşılan ortak uzlaşı görüşü bulunmamaktadır.';

    const prompt = `
Aşağıdaki verilere dayanarak bir müzakere oturumunun 3-5 cümlelik, tarafsız, profesyonel, akademik ve nötr bir Türkçe "Yönetici Özeti" metnini yaz.

Müzakere Konusu: "${question}"
Katılımcı Sayısı: ${participantsCount}
Onaylı Görüş Sayısı: ${statementsCount}
Fikir Grubu (Kamp) Sayısı: ${campsCount}
Kutuplaşma Derecesi: %${polarisability !== null && polarisability !== undefined ? polarisability : 'Hesaplanamadı'}
Köprü (Uzlaşı) Cümle Sayısı: ${bridgesCount}
Köprü Görüşler:
${bridgesList}
Katılım Eşitliği (Gini Katsayısı): ${participationGini !== undefined ? participationGini : 'Hesaplanamadı'} (Not: Değer 0'a yakınsa dengeli katılımı, 1'e yakınsa az sayıda kişinin baskınlığını gösterir)
Oy Tamamlama Oranı: %${voteCompletionRate !== undefined ? voteCompletionRate : 'Hesaplanamadı'}

Kurallar:
- Sadece yukarıda verilen sayısal bulguları ve verileri kullanarak bir özet oluştur.
- KESİNLİKLE yeni bir yorum, öneri, değer yargısı veya veri dışı çıkarım ekleme.
- Katılımcı isimlerini veya rumuzlarını KESİNLİKLE bu özette geçirme.
- Metin 3-5 cümleden oluşmalıdır. Akıcı, tarafsız ve düzyazı formatında olmalıdır.
- Çıktı sadece özet metinden oluşmalıdır. "Thinking Process" veya düşünme adımları KESİNLİKLE çıktıya DAHİL EDİLMEMELİDİR.
`;

    const response = await openaiClient.chat.completions.create({
      model: modelName,
      messages: [
        { role: 'system', content: 'Sen sadece verilen sayısal ve istatistiksel verileri nötr bir Türkçe metne dönüştüren ve asla düşünme adımlarını/düşünme sürecini çıktıya dahil etmeyen bir analiz asistanısın.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 800,
      temperature: 0.3,
    });

    let summary = response.choices[0]?.message?.content?.trim();
    if (summary) {
      // Düşünme etiketlerini ve Thinking Process kısımlarını temizle
      summary = summary.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      summary = summary.replace(/^Thinking Process:[\s\S]*?(?=(Bu raporda|Oturumda|Müzakere))/i, '').trim();
      
      // Eğer hala 'Thinking Process' içeriyorsa ve sonunda temiz bir paragraf varsa onu al
      if (summary.toLowerCase().includes('thinking process')) {
        const paragraphs = summary.split('\n\n').map(p => p.trim()).filter(Boolean);
        const nonThinking = paragraphs.filter(p => !p.toLowerCase().includes('thinking process') && !p.startsWith('*') && !p.startsWith('-'));
        if (nonThinking.length > 0) {
          summary = nonThinking.join('\n\n');
        }
      }

      // Herhangi bir Review / constraints / refining bölümü başlarsa oradan sonrasını kes
      const reviewMatch = summary.match(/\n\n\d+\.\s+\*\*(Review|Refining|Constraint|Revised)/i);
      if (reviewMatch) {
        summary = summary.substring(0, reviewMatch.index).trim();
      }

      const reviewMatch2 = summary.match(/\n\n\*\*Review/i);
      if (reviewMatch2) {
        summary = summary.substring(0, reviewMatch2.index).trim();
      }
      
      if (summary && summary.length > 50) {
        return summary;
      }
    }
    throw new Error('LLM boş veya geçersiz yanıt döndürdü.');
  } catch (err) {
    console.error('Yönetici Özeti LLM çağrısı başarısız oldu, kural tabanlı özet kullanılıyor:', err.message);
    return ruleBasedSummary;
  }
}





