/**
 * Müzakere Masası - Matematik Analiz Motoru
 * PCA (Temel Bileşenler Analizi) ve K-Means algoritmalarını içerir.
 */

/**
 * NIPALS (Non-linear Iterative Partial Least Squares) algoritması ile PCA hesaplar.
 * Eksik oylar (null) pairwise deletion ile işlenir — null hücreler hesaba hiç girmez.
 *
 * @param {(number|null)[][]} X - Katılımcı oy matrisi. Satırlar: Katılımcılar, Sütunlar: Görüşler.
 *                                Katılıyorum: 1, Katılmıyorum: -1, Geç/Nötr: 0, Oy yok: null.
 * @param {number} numComponents - Çıkarılacak bileşen sayısı (Varsayılan: 2)
 * @returns {{scores: number[][], loadings: number[][], varianceExplained: number[]}}
 *          scores: Katılımcıların 2D koordinatları (N x numComponents)
 *          loadings: Görüşlerin eksenlerdeki ağırlıkları (numComponents x M)
 *          varianceExplained: Her bileşenin açıkladığı varyans oranı (ör. [0.42, 0.18])
 */
export function calculatePCA(X, numComponents = 2, maxIter = 100, tol = 1e-6) {
  const n = X.length;
  if (n === 0) return { scores: [], loadings: [], varianceExplained: [] };
  const m = X[0].length;
  if (m === 0) return {
    scores: Array(n).fill(0).map(() => Array(numComponents).fill(0)),
    loadings: [],
    varianceExplained: []
  };

  // X matrisinin kopyasını oluştur (E matrisi) — null değerler korunur
  let E = X.map(row => [...row]);

  // Sütunları merkezileştir: sadece null olmayan değerlerin ortalamasını kullan.
  // null hücreler null kalır (pairwise deletion için gerekli).
  const colMeans = Array(m).fill(0);
  for (let j = 0; j < m; j++) {
    let sum = 0;
    let count = 0;
    for (let i = 0; i < n; i++) {
      if (E[i][j] !== null && E[i][j] !== undefined && !isNaN(E[i][j])) {
        sum += E[i][j];
        count++;
      }
    }
    colMeans[j] = count > 0 ? sum / count : 0;
    for (let i = 0; i < n; i++) {
      if (E[i][j] !== null && E[i][j] !== undefined && !isNaN(E[i][j])) {
        E[i][j] -= colMeans[j];
      }
      // null hücreler olduğu gibi null kalır
    }
  }

  // Toplam varyansı hesapla (Frobenius norm karesi) — sadece null olmayan hücreler
  let totalVariance = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      if (E[i][j] !== null && E[i][j] !== undefined && !isNaN(E[i][j])) {
        totalVariance += E[i][j] * E[i][j];
      }
    }
  }

  const scores = Array(n).fill(0).map(() => Array(numComponents).fill(0));
  const loadings = Array(numComponents).fill(0).map(() => Array(m).fill(0));
  const varianceExplained = [];

  for (let c = 0; c < numComponents; c++) {
    // Başlangıç t vektörü: her satır için null olmayan ilk değeri al
    let t = E.map(row => {
      for (let j = 0; j < m; j++) {
        if (row[j] !== null && row[j] !== undefined && !isNaN(row[j])) {
          return row[j];
        }
      }
      return 0;
    });
    let p = Array(m).fill(0);

    for (let iter = 0; iter < maxIter; iter++) {
      const tDotT_total = t.reduce((sum, val) => sum + val * val, 0);
      if (tDotT_total < 1e-10) break;

      // p = E^T * t / (t^T * t) — pairwise deletion:
      // Her j sütunu için sadece E[i][j] != null olan satırlar kullanılır.
      for (let j = 0; j < m; j++) {
        let numerator = 0;
        let denominator = 0;
        for (let i = 0; i < n; i++) {
          if (E[i][j] !== null && E[i][j] !== undefined && !isNaN(E[i][j])) {
            numerator += E[i][j] * t[i];
            denominator += t[i] * t[i];
          }
        }
        p[j] = denominator > 1e-10 ? numerator / denominator : 0;
      }

      // p vektörünü normalize et (p / ||p||)
      const pNorm = Math.sqrt(p.reduce((sum, val) => sum + val * val, 0));
      if (pNorm < 1e-10) break;
      for (let j = 0; j < m; j++) p[j] /= pNorm;

      // Yeni t vektörünü hesapla (t_new = E * p) — pairwise deletion:
      // Her i satırı için sadece E[i][j] != null olan sütunlar katkıda bulunur.
      const tNew = Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let j = 0; j < m; j++) {
          if (E[i][j] !== null && E[i][j] !== undefined && !isNaN(E[i][j])) {
            sum += E[i][j] * p[j];
          }
        }
        tNew[i] = sum;
      }

      // Yakınsama testi
      let diff = 0;
      for (let i = 0; i < n; i++) {
        diff += (tNew[i] - t[i]) * (tNew[i] - t[i]);
      }
      t = tNew;

      if (diff < tol) break;
    }

    // Bu bileşenin açıkladığı varyans oranını hesapla (deflation öncesi)
    const componentVariance = t.reduce((sum, val) => sum + val * val, 0);
    varianceExplained.push(totalVariance > 1e-10 ? componentVariance / totalVariance : 0);

    // E matrisini güncelle (deflation): E = E - t * p^T
    // Sadece null olmayan hücrelerde deflation uygulanır; null hücreler değişmez.
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m; j++) {
        if (E[i][j] !== null && E[i][j] !== undefined && !isNaN(E[i][j])) {
          E[i][j] -= t[i] * p[j];
        }
      }
    }

    // Ağırlık ve skorları kaydet
    for (let j = 0; j < m; j++) loadings[c][j] = p[j];
    for (let i = 0; i < n; i++) scores[i][c] = t[i];
  }

  return { scores, loadings, varianceExplained };
}

/**
 * Katılımcıların 2D koordinatlarını K-Means ile gruplar.
 * @param {number[][]} points - Katılımcıların 2D koordinat listesi (N x 2)
 * @param {number} k - Küme sayısı (Kamp sayısı)
 * @returns {{assignments: number[], centroids: number[][]}}\
 *          assignments: Her katılımcının hangi kampa ait olduğu (N boyutlu dizi)
 *          centroids: Kampların merkez koordinatları (k x 2)
 */
export function calculateKMeans(points, k = 3, maxIter = 50) {
  const n = points.length;
  if (n === 0) return { assignments: [], centroids: [] };

  // Katılımcı sayısı kamp sayısından azsa her birini kendi kampına koy
  if (n <= k) {
    return {
      assignments: Array.from({ length: n }, (_, i) => i),
      centroids: points.map(p => [...p])
    };
  }

  // Centroidleri rastgele seç (Basit random pick)
  let centroids = [];
  const usedIndices = new Set();
  while (centroids.length < k) {
    const idx = Math.floor(Math.random() * n);
    if (!usedIndices.has(idx)) {
      centroids.push([...points[idx]]);
      usedIndices.add(idx);
    }
  }

  let assignments = Array(n).fill(-1);
  let changed = true;
  let iter = 0;

  while (changed && iter < maxIter) {
    changed = false;
    iter++;

    // Her noktayı en yakın centroid'e ata
    const nextAssignments = [];
    for (let i = 0; i < n; i++) {
      const p = points[i];
      let minD = Infinity;
      let bestC = 0;
      for (let c = 0; c < k; c++) {
        const cnt = centroids[c];
        const d = (p[0] - cnt[0]) * (p[0] - cnt[0]) + (p[1] - cnt[1]) * (p[1] - cnt[1]);
        if (d < minD) {
          minD = d;
          bestC = c;
        }
      }
      nextAssignments.push(bestC);
      if (nextAssignments[i] !== assignments[i]) {
        changed = true;
      }
    }
    assignments = nextAssignments;

    // Centroidleri yeniden hesapla
    const newCentroids = Array(k).fill(0).map(() => [0, 0]);
    const counts = Array(k).fill(0);
    for (let i = 0; i < n; i++) {
      const c = assignments[i];
      newCentroids[c][0] += points[i][0];
      newCentroids[c][1] += points[i][1];
      counts[c]++;
    }

    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        centroids[c] = [
          newCentroids[c][0] / counts[c],
          newCentroids[c][1] / counts[c]
        ];
      } else {
        // Boş küme kalırsa rastgele bir noktaya taşı
        const idx = Math.floor(Math.random() * n);
        centroids[c] = [...points[idx]];
        changed = true;
      }
    }
  }

  return { assignments, centroids };
}

/**
 * K-Means'i `runs` kez farklı rastgele başlangıçla çalıştırır.
 * En düşük WCSS (Within-Cluster Sum of Squares) skoruna sahip sonucu seçer.
 * Ayrıca çalıştırmalar arasındaki küme etiket kararlılığını (clusterStability) hesaplar.
 *
 * @param {number[][]} points - 2D koordinat listesi
 * @param {number} k - Küme sayısı
 * @param {number} runs - Kaç kez çalıştırılacağı (varsayılan 5)
 * @returns {{assignments: number[], centroids: number[][], clusterStability: number}}
 *          clusterStability: 0.0–1.0 arası, 1.0 = tüm çalıştırmalarda aynı sonuç
 */
export function runKMeansWithStability(points, k, runs = 5) {
  const n = points.length;
  if (n === 0) return { assignments: [], centroids: [], clusterStability: 1.0 };
  if (n <= k) {
    return {
      assignments: Array.from({ length: n }, (_, i) => i),
      centroids: points.map(p => [...p]),
      clusterStability: 1.0
    };
  }

  const results = [];

  for (let r = 0; r < runs; r++) {
    const result = calculateKMeans(points, k);

    // WCSS hesapla: her nokta ile bağlı olduğu centroid arasındaki kare mesafelerinin toplamı
    let wcss = 0;
    for (let i = 0; i < n; i++) {
      const c = result.assignments[i];
      const centroid = result.centroids[c];
      const dx = points[i][0] - centroid[0];
      const dy = points[i][1] - centroid[1];
      wcss += dx * dx + dy * dy;
    }
    results.push({ ...result, wcss });
  }

  // En iyi sonucu (en düşük WCSS) seç
  results.sort((a, b) => a.wcss - b.wcss);
  const best = results[0];

  // Küme Kararlılığı: her çalıştırmayı best'e hizalayıp katılımcıların
  // kaçının aynı kümeye atandığına bak. Ortalama uyum oranı = clusterStability.
  let totalAgreement = 0;
  for (let r = 0; r < runs; r++) {
    // Bu çalıştırmayı best centroid'leriyle hizala (etiket permütasyonu sorununu gider)
    const aligned = alignCentroids(results[r].centroids, results[r].assignments, best.centroids);
    let agreement = 0;
    for (let i = 0; i < n; i++) {
      if (aligned.assignments[i] === best.assignments[i]) agreement++;
    }
    totalAgreement += agreement / n;
  }

  const clusterStability = parseFloat((totalAgreement / runs).toFixed(3));

  return {
    assignments: best.assignments,
    centroids: best.centroids,
    clusterStability
  };
}

/**
 * Kamp analizlerini yapar: Köprü cümleleri ve kampların karakteristik cümlelerini bulur.
 * @param {object[]} statements - Tüm görüşlerin listesi
 * @param {object[]} participants - Tüm katılımcıların listesi
 * @param {number[]} assignments - Katılımcıların kamp eşleşmeleri
 * @param {number} k - Kamp sayısı
 */
export function analyzeCampsAndBridges(statements, participants, assignments, k = 3) {
  const m = statements.length;
  if (m === 0) return { bridges: [], campCharacteristics: Array(k).fill(0).map(() => []) };

  // Kamp bazında katılım sayılarını bul
  const campSizes = Array(k).fill(0);
  assignments.forEach(c => campSizes[c]++);

  // Görüş bazında her kampın oy dağılımını hesapla
  // votes: campVotes[campId][statementId] = { agree: 0, disagree: 0, pass: 0 }
  const campVotes = Array(k).fill(0).map(() =>
    Array(m).fill(0).map(() => ({ agree: 0, disagree: 0, pass: 0, total: 0 }))
  );

  participants.forEach((p, pIdx) => {
    const c = assignments[pIdx];
    if (c === undefined || c < 0 || c >= k) return;

    statements.forEach((st, sIdx) => {
      const voteVal = p.votes[st.id]; // 1: agree, -1: disagree, 0: pass/nötr, undefined: oy vermedi
      if (voteVal === 1) {
        campVotes[c][sIdx].agree++;
        campVotes[c][sIdx].total++;
      } else if (voteVal === -1) {
        campVotes[c][sIdx].disagree++;
        campVotes[c][sIdx].total++;
      } else if (voteVal === 0) {
        campVotes[c][sIdx].pass++;
        // Bilinçli "Geç" oyu total'e dahil edilmez (onay oranını etkilememesi için)
      }
      // undefined/null: oy vermemiş, hiçbir sayaca eklenmez
    });
  });

  const bridges = [];
  const campCharacteristics = Array(k).fill(0).map(() => []);

  statements.forEach((st, sIdx) => {
    // Her kamp için onay oranını bul: katılıyorum / (katılıyorum + katılmıyorum)
    const campApprovalRates = [];

    for (let c = 0; c < k; c++) {
      const votes = campVotes[c][sIdx];
      // Eğer kampta hiç kimse +1/-1 oyu kullanmadıysa oranı 0 kabul et
      const rate = votes.total > 0 ? votes.agree / votes.total : 0;
      campApprovalRates.push(rate);
    }

    // 1. Köprü Görüş Testi (Tüm aktif kamplarda yüksek oranda onay alan)
    // En az 2 kamp aktifse köprü aranabilir
    const activeCampsCount = campSizes.filter(s => s > 0).length;
    if (activeCampsCount >= 2) {
      const minApproval = Math.min(...campApprovalRates.filter((_, c) => campSizes[c] > 0));
      const overallAgreeCount = participants.filter(p => p.votes[st.id] === 1).length;
      const overallVoteCount = participants.filter(p => p.votes[st.id] === 1 || p.votes[st.id] === -1).length;
      const overallRate = overallVoteCount > 0 ? overallAgreeCount / overallVoteCount : 0;

      // Köprü kriteri: Tüm aktif kamplarda onay oranı >= %60
      if (minApproval >= 0.6) {
        bridges.push({
          statement: st,
          minApproval,
          overallRate,
          campApprovalRates
        });
      }
    } else {
      // Tek kamp varsa, genel onay oranı %70 üzerindekileri uzlaşı kabul et
      const overallAgreeCount = participants.filter(p => p.votes[st.id] === 1).length;
      const overallVoteCount = participants.filter(p => p.votes[st.id] === 1 || p.votes[st.id] === -1).length;
      const overallRate = overallVoteCount > 0 ? overallAgreeCount / overallVoteCount : 0;
      if (overallRate >= 0.7) {
        bridges.push({
          statement: st,
          minApproval: overallRate,
          overallRate,
          campApprovalRates
        });
      }
    }

    // 2. Kamp Karakteristiği Testi
    // Bir kampın yüksek kabul verip, diğer kampların düşük kabul ettiği görüşler
    for (let c = 0; c < k; c++) {
      if (campSizes[c] === 0) continue;
      const thisCampRate = campApprovalRates[c];

      // Diğer kampların ortalama kabul oranı
      let otherCampsSum = 0;
      let otherCampsCount = 0;
      for (let cOther = 0; cOther < k; cOther++) {
        if (cOther !== c && campSizes[cOther] > 0) {
          otherCampsSum += campApprovalRates[cOther];
          otherCampsCount++;
        }
      }
      const otherCampRateAvg = otherCampsCount > 0 ? otherCampsSum / otherCampsCount : 0;
      const contrastScore = thisCampRate - otherCampRateAvg;

      // Kamp içi onay yüksek (>%50) ve diğer kamplardan farkı belirgin (>0.2) ise
      if (thisCampRate >= 0.5 && contrastScore >= 0.2) {
        campCharacteristics[c].push({
          statement: st,
          approvalRate: thisCampRate,
          contrastScore,
          otherCampRateAvg
        });
      }
    }
  });

  // Köprü görüşleri onay oranına göre sırala
  bridges.sort((a, b) => b.minApproval - a.minApproval);

  // Kamp karakteristiklerini ayırt edicilik skoruna göre sırala ve ilk 3'ü al
  for (let c = 0; c < k; c++) {
    campCharacteristics[c].sort((a, b) => b.contrastScore - a.contrastScore);
    campCharacteristics[c] = campCharacteristics[c].slice(0, 3);
  }

  // ⏱ campApprovalRatesTable: campId → statementId → rate
  // campVotes zaten yukarıda hesaplanmıştı — sıfır ek maliyet.
  // getCampAssignmentExplanation bu tabloyu kullanarak tüm oy matrisini
  // tekrar taramak zorunda kalmaz.
  const campApprovalRatesTable = {};
  for (let c = 0; c < k; c++) {
    campApprovalRatesTable[c] = {};
    statements.forEach((st, sIdx) => {
      const votes = campVotes[c][sIdx];
      campApprovalRatesTable[c][st.id] = votes.total > 0 ? votes.agree / votes.total : 0;
    });
  }

  return {
    bridges,
    campCharacteristics,
    campApprovalRatesTable
  };
}

/**
 * Yeni hesaplanan centroid'leri, bir önceki turun centroid'leri ile eşleştirerek küme etiketlerinin
 * kararlılığını (label stability) sağlar. Greedy nearest-neighbor matching kullanır.
 */
export function alignCentroids(newCentroids, assignments, previousCentroids) {
  if (!previousCentroids || previousCentroids.length === 0 || newCentroids.length === 0) {
    return { assignments, centroids: newCentroids };
  }

  const k = newCentroids.length;
  const kp = previousCentroids.length;

  // Tüm çiftler arasındaki mesafeleri hesapla
  const pairs = [];
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < kp; j++) {
      const nc = newCentroids[i];
      const oc = previousCentroids[j];
      const dist = (nc[0] - oc[0]) * (nc[0] - oc[0]) + (nc[1] - oc[1]) * (nc[1] - oc[1]);
      pairs.push({ newIdx: i, oldIdx: j, dist });
    }
  }

  // Mesafeye göre küçükten büyüğe sırala
  pairs.sort((a, b) => a.dist - b.dist);

  const matchedNew = new Set();
  const matchedOld = new Set();
  const indexMapping = {}; // newIdx -> oldIdx

  // Greedy eşleştirme
  for (const pair of pairs) {
    if (!matchedNew.has(pair.newIdx) && !matchedOld.has(pair.oldIdx)) {
      matchedNew.add(pair.newIdx);
      matchedOld.add(pair.oldIdx);
      indexMapping[pair.newIdx] = pair.oldIdx;
    }
  }

  // Eşleşmeyen yeni kümeler varsa (örneğin k > kp ise), bunları kalan boş eski indekslere ata
  let nextAvailableOldIdx = 0;
  for (let i = 0; i < k; i++) {
    if (indexMapping[i] === undefined) {
      while (matchedOld.has(nextAvailableOldIdx) && nextAvailableOldIdx < k) {
        nextAvailableOldIdx++;
      }
      indexMapping[i] = nextAvailableOldIdx;
      matchedOld.add(nextAvailableOldIdx);
    }
  }

  // Yeni centroid ve assignments dizilerini mapping'e göre güncelle
  const alignedCentroids = Array(k).fill(0).map(() => [0, 0]);
  for (let i = 0; i < k; i++) {
    const oldIdx = indexMapping[i];
    if (oldIdx < k) {
      alignedCentroids[oldIdx] = [...newCentroids[i]];
    } else {
      alignedCentroids[i] = [...newCentroids[i]];
      indexMapping[i] = i;
    }
  }

  const alignedAssignments = assignments.map(val => indexMapping[val] !== undefined ? indexMapping[val] : val);

  return { assignments: alignedAssignments, centroids: alignedCentroids };
}

/**
 * ANOVA tabanlı varyans formülüyle kutuplaşma derecesini (polarisability) hesaplar.
 *
 * @param {Array} points - Katılımcı noktaları listesi, her biri { x, y, campId } içermeli.
 * @param {Array} camps - Kamp (küme) listesi, her biri { id, size, x, y } içermeli.
 * @returns {{polarisability: number|null, insufficientVariance: boolean}}
 */
export function calculatePolarisability(points, camps) {
  const n = points.length;
  if (n === 0) {
    return { polarisability: null, insufficientVariance: true };
  }

  // 1. Genel Merkez'i (tüm noktaların ortalaması) hesapla
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += points[i].x;
    sumY += points[i].y;
  }
  const genelMerkezX = sumX / n;
  const genelMerkezY = sumY / n;

  // 2. Toplam Varyans'ı hesapla: Σ_i [ ||nokta_i - genelMerkez||² ]
  let totalVariance = 0;
  for (let i = 0; i < n; i++) {
    const dx = points[i].x - genelMerkezX;
    const dy = points[i].y - genelMerkezY;
    totalVariance += dx * dx + dy * dy;
  }

  // Guard Clause: ToplamVaryans === 0 (veya kayan noktalı sayı hassasiyeti için çok küçükse)
  if (totalVariance <= 1e-9) {
    return { polarisability: null, insufficientVariance: true };
  }

  // 3. Kamplar Arası Varyans'ı hesapla: Σ_k [ n_k * ||merkez_k - genelMerkez||² ]
  let betweenCampVariance = 0;
  for (let k = 0; k < camps.length; k++) {
    const camp = camps[k];
    const n_k = camp.size;
    const dx = camp.x - genelMerkezX;
    const dy = camp.y - genelMerkezY;
    betweenCampVariance += n_k * (dx * dx + dy * dy);
  }

  // 4. Kutuplaşma derecesini hesapla: (KamplarArasıVaryans / ToplamVaryans) * 100
  const polarisabilityRaw = (betweenCampVariance / totalVariance) * 100;

  // 5. Güvenlik kancası: ANOVA garantisi geçerliyse [0,100] aralığında olmalı.
  //    Floating point hatası veya koordinat uzayı tutarsızlığı nedeniyle
  //    bu aralık dışına çıkarsa null döndür (eksik varyans olarak işaretle).
  if (polarisabilityRaw < 0 || polarisabilityRaw > 100.5) {
    console.warn(`[calculatePolarisability] Geçersiz değer: ${polarisabilityRaw.toFixed(2)}% — koordinat uzayı tutarsızlığı olabilir. null döndürülüyor.`);
    return { polarisability: null, insufficientVariance: true };
  }

  const polarisability = Math.min(100, Math.max(0, polarisabilityRaw));

  return {
    polarisability: parseFloat(polarisability.toFixed(2)),
    insufficientVariance: false
  };
}

/**
 * Bir katılımcının neden belirli bir kampa yerleştirildiğini açıklayan verileri üretir.
 *
 * @param {string} participantId - Katılımcı ID
 * @param {object} session - DB'deki oturum nesnesi
 * @returns {object|null} Açıklama nesnesi
 */
export function getCampAssignmentExplanation(participantId, session) {
  if (!session || !session.analysis || !session.analysis.points || !session.analysis.camps) {
    return null;
  }

  const participant = session.participants?.find(p => p.id === participantId);
  if (!participant) return null;

  const point = session.analysis.points.find(pt => pt.id === participantId || (participant.nickname && pt.nickname === participant.nickname));
  if (!point || point.campId === undefined || point.campId === null) {
    return null;
  }

  const camp = session.analysis.camps.find(c => c.id === point.campId);
  const campName = session.customCampNames?.[point.campId] || camp?.name || `Fikir Grubu ${String.fromCharCode(65 + point.campId)}`;

  const statements = session.statements || [];

  // ─── HIZ YOLU: campApprovalRates önbelleği mevcut (runAnalysis her tetiklendiğinde üretiliyor)
  // Bu path tamamen O(S) — S: görüş sayısı. Hiçbir katılımcı döngüsü yok.
  const cachedRates = session.analysis.campApprovalRates?.[point.campId];

  // ─── YAVAŞ YOL (lazy fallback): Önbellek eksikse — sadece o zaman O(n*S) hesapla
  // Bu durumda uyarı bas; production'da bu path'e ASLA girilmemeli.
  let sameCampParticipants = null;
  const getSameCampParticipants = () => {
    if (sameCampParticipants !== null) return sameCampParticipants;
    console.warn(`⚠️ [CAMP EXPLANATION SLOW PATH] Oturum ${session.code || '?'} — campApprovalRates önbelleği eksik, O(n×S) fallback hesaplamaya girildi. runAnalysis'in tamamlandığından emin olun.`);

    // O(n) hashmap: participantId / nickname → campId
    const campIdMap = new Map();
    for (const pt of session.analysis.points) {
      campIdMap.set(pt.id, pt.campId);
      if (pt.nickname) campIdMap.set(pt.nickname, pt.campId);
    }
    const activeParticipants = (session.participants || []).filter(p => !p.isBanned);
    sameCampParticipants = activeParticipants.filter(p => {
      const cid = campIdMap.get(p.id) ?? campIdMap.get(p.nickname);
      return cid === point.campId;
    });
    return sameCampParticipants;
  };

  const scoredVotes = [];

  statements.forEach(st => {
    const userVote = participant.votes?.[st.id]; // 1: Katılıyorum, -1: Katılmıyorum, 0: Nötr, undefined: oylamadı
    if (userVote === undefined || userVote === 0) return; // Nötr veya oylanmamışları atla

    let campAgreeRate;

    if (cachedRates !== undefined && cachedRates[st.id] !== undefined) {
      // ✅ O(1) önbellek lookup — hız yolu
      campAgreeRate = cachedRates[st.id];
    } else {
      // ⚠️ O(n) fallback — önbellek bu görüş için eksik
      const peers = getSameCampParticipants();
      let agreeCount = 0;
      let totalVotes = 0;
      peers.forEach(p => {
        const v = p.votes?.[st.id];
        if (v === 1) { agreeCount++; totalVotes++; }
        else if (v === -1) { totalVotes++; }
      });
      campAgreeRate = totalVotes > 0 ? agreeCount / totalVotes : 0;
    }

    // Uyum skoru: Katılımcı 1 verdiğinde grubun kabul oranı yüksekse,
    // veya katılımcı -1 verdiğinde grubun red oranı yüksekse (1 - agreeRate)
    let alignmentScore = 0;
    if (userVote === 1) {
      alignmentScore = campAgreeRate;
    } else if (userVote === -1) {
      alignmentScore = 1 - campAgreeRate;
    }

    scoredVotes.push({
      statementId: st.id,
      text: st.text,
      userVote: userVote === 1 ? 'AGREE' : 'DISAGREE',
      campApprovalRate: Math.round(campAgreeRate * 100),
      alignmentScore
    });
  });

  // En yüksek 3 belirleyici oyu seç
  scoredVotes.sort((a, b) => b.alignmentScore - a.alignmentScore);
  const definingVotes = scoredVotes.slice(0, 3);

  return {
    participantId,
    campId: point.campId,
    campName,
    definingVotes
  };
}

