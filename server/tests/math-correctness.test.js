/**
 * Matematiksel / Algoritmik Dogruluk Test Paketi
 * Calistirmak icin: npm test
 */
import { describe, it, expect } from "vitest";
import {
  calculatePCA,
  calculateKMeans,
  runKMeansWithStability,
  calculatePolarisability,
  analyzeCampsAndBridges,
} from "../algorithms.js";

// ─── 1. PCA ───────────────────────────────────────────────────
describe("calculatePCA", () => {
  it("bos matris icin bos sonuc doner", () => {
    const result = calculatePCA([]);
    expect(result.scores).toEqual([]);
    expect(result.loadings).toEqual([]);
    expect(result.varianceExplained).toEqual([]);
  });

  it("tum null matris - sonuclar sonlu sayilar icerir", () => {
    const X = [[null, null],[null, null],[null, null]];
    const result = calculatePCA(X);
    expect(result.scores.length).toBe(3);
    result.scores.forEach(row => row.forEach(val => expect(isFinite(val)).toBe(true)));
  });

  it("acikca ayrisim - varianceExplained toplami <= 1", () => {
    const X = [[1,-1],[1,-1],[-1,1],[-1,1]];
    const result = calculatePCA(X, 2);
    expect(result.scores.length).toBe(4);
    const total = result.varianceExplained.reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(1.0001);
    expect(total).toBeGreaterThan(0);
  });

  it("scores uzunlugu katilimci sayisina esit", () => {
    const X = [[1,0,-1],[0,1,1],[-1,-1,0],[1,1,-1]];
    const result = calculatePCA(X, 2);
    expect(result.scores.length).toBe(4);
    result.scores.forEach(row => expect(row.length).toBe(2));
  });
});

// ─── 2. K-Means ────────────────────────────────────────────────
describe("calculateKMeans", () => {
  it("bos noktalar icin bos sonuc", () => {
    const { assignments, centroids } = calculateKMeans([], 2);
    expect(assignments).toEqual([]);
    expect(centroids).toEqual([]);
  });

  it("nokta <= k ise her nokta kendi kumesinde", () => {
    const points = [[0,0],[10,10]];
    const { assignments } = calculateKMeans(points, 3);
    expect(assignments.length).toBe(2);
    expect(assignments[0]).not.toBe(assignments[1]);
  });

  it("k=1 - tum noktalar ayni kumede", () => {
    const points = [[0,0],[5,5],[10,10],[3,7]];
    const { assignments } = calculateKMeans(points, 1);
    expect(new Set(assignments).size).toBe(1);
  });

  it("acikca ayrisim - iki kume dogru atanir", () => {
    const left  = [[-50,0],[-51,1],[-49,-1],[-52,0]];
    const right = [[50,0],[51,1],[49,-1],[52,0]];
    const points = [...left, ...right];
    const { assignments } = calculateKMeans(points, 2);
    const leftLabel  = assignments[0];
    const rightLabel = assignments[4];
    expect(leftLabel).not.toBe(rightLabel);
    for (let i = 0; i < 4; i++) expect(assignments[i]).toBe(leftLabel);
    for (let i = 4; i < 8; i++) expect(assignments[i]).toBe(rightLabel);
  });
});

// ─── 3. runKMeansWithStability ─────────────────────────────────
describe("runKMeansWithStability", () => {
  it("clusterStability 0-1 araliginda doner", () => {
    const pts = [[-50,0],[-51,1],[-49,-1],[50,0],[51,1],[49,-1]];
    const { clusterStability } = runKMeansWithStability(pts, 2, 5);
    expect(clusterStability).toBeGreaterThanOrEqual(0);
    expect(clusterStability).toBeLessThanOrEqual(1);
  });

  it("tamamen ayrisim - stability >= 0.8", () => {
    const left  = [[-80,0],[-81,1],[-79,-1],[-82,0],[-78,2]];
    const right = [[80,0],[81,1],[79,-1],[82,0],[78,2]];
    const { clusterStability } = runKMeansWithStability([...left,...right], 2, 5);
    expect(clusterStability).toBeGreaterThanOrEqual(0.8);
  });
});

// ─── 4. calculatePolarisability ────────────────────────────────
describe("calculatePolarisability", () => {
  it("bos points - null doner", () => {
    const { polarisability, insufficientVariance } = calculatePolarisability([], []);
    expect(polarisability).toBeNull();
    expect(insufficientVariance).toBe(true);
  });

  it("sifir varyans - null doner", () => {
    const pts = [{x:0,y:0},{x:0,y:0},{x:0,y:0}];
    const camps = [{id:0,x:0,y:0,size:3}];
    const { polarisability, insufficientVariance } = calculatePolarisability(pts, camps);
    expect(polarisability).toBeNull();
    expect(insufficientVariance).toBe(true);
  });

  it("tamamen ayrisim - polarizasyon >= 50", () => {
    const pts = [{x:-70,y:0},{x:-72,y:1},{x:-68,y:-1},{x:70,y:0},{x:72,y:1},{x:68,y:-1}];
    const camps = [{id:0,x:-70,y:0,size:3},{id:1,x:70,y:0,size:3}];
    const { polarisability, insufficientVariance } = calculatePolarisability(pts, camps);
    expect(insufficientVariance).toBe(false);
    expect(polarisability).toBeGreaterThanOrEqual(50);
  });

  it("tek kump - dusuk polarizasyon (< 20)", () => {
    const pts = [{x:-2,y:0},{x:0,y:1},{x:2,y:-1},{x:0,y:2}];
    const camps = [{id:0,x:0,y:0.5,size:4}];
    const { polarisability } = calculatePolarisability(pts, camps);
    expect(polarisability).toBeLessThan(20);
  });
});

// ─── 5. Bridge Esigi (%60) ─────────────────────────────────────
describe("analyzeCampsAndBridges — bridge esigi", () => {
  const makeP = (id, votes) => ({ id, nickname: `p${id}`, votes });

  it("bos gorusler - bridge yok", () => {
    const { bridges } = analyzeCampsAndBridges([], [], [], 2);
    expect(bridges).toEqual([]);
  });

  it("her iki kampta >= %60 agree - bridge olur", () => {
    const st = { id: "s1", text: "Uzlasi" };
    const pts = [0,1,2,3,4,5].map(i => makeP(i, { s1: 1 }));
    const { bridges } = analyzeCampsAndBridges([st], pts, [0,0,0,1,1,1], 2);
    expect(bridges.length).toBe(1);
    expect(bridges[0].minApproval).toBeGreaterThanOrEqual(0.6);
  });

  it("bir kamp < %60 - bridge OLMAZ", () => {
    const st = { id: "s2", text: "Tartismali" };
    const pts = [
      makeP(0,{s2:1}), makeP(1,{s2:1}), makeP(2,{s2:1}),   // kamp0: %100
      makeP(3,{s2:1}), makeP(4,{s2:-1}), makeP(5,{s2:-1}),  // kamp1: %33
    ];
    const { bridges } = analyzeCampsAndBridges([st], pts, [0,0,0,1,1,1], 2);
    expect(bridges.length).toBe(0);
  });

  it("tam sinirda %60 agree - bridge olur", () => {
    const st = { id: "s3", text: "Sinir gorusu" };
    // Her kamp: 3 agree, 2 disagree => 3/5 = 0.60
    const pts = [
      makeP(0,{s3:1}),makeP(1,{s3:1}),makeP(2,{s3:1}),makeP(3,{s3:-1}),makeP(4,{s3:-1}),
      makeP(5,{s3:1}),makeP(6,{s3:1}),makeP(7,{s3:1}),makeP(8,{s3:-1}),makeP(9,{s3:-1}),
    ];
    const { bridges } = analyzeCampsAndBridges([st], pts, [0,0,0,0,0,1,1,1,1,1], 2);
    expect(bridges.length).toBe(1);
    expect(bridges[0].minApproval).toBeCloseTo(0.6, 5);
  });
});

// ─── 6. Gini Katsayisi ─────────────────────────────────────────
describe("Gini katsayisi", () => {
  function calculateGini(values) {
    const n = values.length;
    if (n === 0) return 0;
    const sum = values.reduce((acc, val) => acc + val, 0);
    if (sum === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    let tempSum = 0;
    for (let i = 0; i < n; i++) tempSum += (i + 1) * sorted[i];
    return parseFloat(((2 * tempSum) / (n * sum) - (n + 1) / n).toFixed(3));
  }

  it("bos dizi -> 0", () => expect(calculateGini([])).toBe(0));
  it("tum sifir -> 0", () => expect(calculateGini([0,0,0])).toBe(0));
  it("esit dagilim -> Gini ~ 0", () => expect(calculateGini([5,5,5,5])).toBeCloseTo(0, 2));
  it("tek kisi her seyi yazmis -> Gini > 0.5", () => expect(calculateGini([100,0,0,0])).toBeGreaterThan(0.5));
  it("tek katilimci -> 0", () => expect(calculateGini([42])).toBeCloseTo(0, 5));
});

// ─── 7. Oy Tamamlama Orani ─────────────────────────────────────
describe("Oy tamamlama orani", () => {
  function calcVoteCompletionRate(participants, statements) {
    const approvedIds = new Set(statements.map(st => st.id));
    let totalVotes = 0;
    participants.forEach(p => Object.keys(p.votes).forEach(id => { if (approvedIds.has(id)) totalVotes++; }));
    const total = participants.length * statements.length;
    if (total === 0) return 0;
    return parseFloat(((totalVotes / total) * 100).toFixed(1));
  }

  it("hic oy yok -> %0", () => {
    expect(calcVoteCompletionRate([{votes:{}},{votes:{}}],[{id:"a"},{id:"b"}])).toBe(0);
  });
  it("tum oylar verilmis -> %100", () => {
    const p = [{votes:{a:1,b:-1}},{votes:{a:-1,b:1}}];
    expect(calcVoteCompletionRate(p,[{id:"a"},{id:"b"}])).toBe(100);
  });
  it("yari tamamlanmis -> %50", () => {
    const p = [{votes:{a:1}},{votes:{a:-1}}];
    expect(calcVoteCompletionRate(p,[{id:"a"},{id:"b"}])).toBe(50.0);
  });
  it("bos katilimci ya da gorusse -> 0", () => {
    expect(calcVoteCompletionRate([],[{id:"a"}])).toBe(0);
    expect(calcVoteCompletionRate([{votes:{a:1}}],[])).toBe(0);
  });
});
