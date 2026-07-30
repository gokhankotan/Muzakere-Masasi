import React, { useState, useEffect } from "react";
import { Printer, ArrowLeft, Download, FileSpreadsheet } from "lucide-react";
import { t } from "../i18n";

export default function ReportView({ onBack, sessionCode, lang = "tr" }) {
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hoveredHistoryPoint, setHoveredHistoryPoint] = useState(null);

  useEffect(() => {
    const code = sessionCode || "DEFAULT";
    const token = localStorage.getItem(`session_token_${code}`) ||
                  localStorage.getItem(`moderator_token_${code}`) ||
                  localStorage.getItem("admin_token");
    fetch(`/api/sessions/${code}/report`, {
      headers: token ? { "Authorization": `Bearer ${token}` } : {}
    })
      .then(res => res.json())
      .then(data => { setReportData(data); setLoading(false); })
      .catch(err => { console.error("Rapor yükleme hatası:", err); setLoading(false); });
  }, [sessionCode]);

  const handlePrint = () => window.print();

  const handleExportJSON = () => {
    if (!reportData) return;
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `muzakere_rapor_${sessionCode || "DEFAULT"}_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "80vh" }}>
        <p style={{ color: "#fff" }}>{lang === "tr" ? "Rapor yükleniyor..." : "Loading report..."}</p>
      </div>
    );
  }

  if (!reportData) {
    return (
      <div style={{ maxWidth: "700px", margin: "4rem auto", padding: "2rem", background: "var(--bg-card)", color: "var(--text-main)", borderRadius: "12px", border: "1px solid var(--border-light)" }}>
        <h2 style={{ color: "var(--color-primary-text)" }}>{lang === "tr" ? "Hata" : "Error"}</h2>
        <p style={{ color: "var(--text-muted)" }}>{lang === "tr" ? "Rapor verileri alınamadı." : "Failed to retrieve report data."}</p>
        <button onClick={onBack} className="btn" style={{ marginTop: "1rem", background: "var(--color-secondary)", color: "#fff" }}>
          {lang === "tr" ? "← Geri Dön" : "← Go Back"}
        </button>
      </div>
    );
  }

  const { question, createdAt, participantsCount, statementsCount, analysis, participants, polarizationImpacts } = reportData;
  const varianceExplained = analysis?.varianceExplained || [];
  const totalVariance = varianceExplained.reduce((s, v) => s + v, 0);
  const showVarianceWarning = !analysis?.insufficientData && !analysis?.insufficientVariance && varianceExplained.length > 0 && totalVariance < 0.40;
  const ambiguousCount = analysis?.points ? analysis.points.filter(pt => pt.ambiguous).length : 0;
  const reportDate = new Date(createdAt).toLocaleDateString(lang === "tr" ? "tr-TR" : "en-US", { year: "numeric", month: "long", day: "numeric" });
  const reportTime = new Date(createdAt).toLocaleTimeString(lang === "tr" ? "tr-TR" : "en-US", { hour: "2-digit", minute: "2-digit" });

  const getConsensusGroupsText = (bridge) => {
    if (!bridge.campApprovalRates || !analysis?.camps || analysis.camps.length === 0) return '';
    const approvedCamps = analysis.camps
      .map((camp, idx) => {
        const rate = bridge.campApprovalRates[idx];
        const customName = analysis?.customCampNames?.[camp.id];
        const campName = customName || camp.name;
        return { name: campName, rate: rate };
      })
      .filter(item => item.rate >= 60);

    if (approvedCamps.length === 0) return '';
    return approvedCamps.map(item => `${item.name} (%${item.rate})`).join(', ');
  };

  return (
    <div style={{ background: "var(--bg-main)", minHeight: "100vh", padding: "2rem 1rem" }}>

      {/* Yazdirma Disi Kontrol Cubugu */}
      <div className="no-print" style={{ maxWidth: "900px", margin: "0 auto 1.5rem auto", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-card)", border: "1px solid var(--border-light)", borderRadius: "12px", padding: "0.75rem 1.25rem" }}>
        <button onClick={onBack} className="btn" style={{ background: "transparent", borderColor: "var(--border-light)", color: "var(--text-main)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <ArrowLeft size={16} /> {lang === "tr" ? "Geri Dön" : "Back"}
        </button>
        <div style={{ display: "flex", gap: "0.6rem" }}>
          {(() => {
            const code = sessionCode || "DEFAULT";
            const token = localStorage.getItem(`session_token_${code}`) ||
                          localStorage.getItem(`moderator_token_${code}`) ||
                          localStorage.getItem("admin_token");
            const csvUrl = `/api/sessions/${code}/export/csv${token ? `?token=${encodeURIComponent(token)}` : ""}`;
            return (
              <a href={csvUrl} className="btn" style={{ border: "1px solid var(--color-agree)", color: "var(--color-agree)", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.4rem", background: "transparent", padding: "0.45rem 0.9rem", borderRadius: "8px", fontSize: "0.85rem" }} download>
                <Download size={14} /> CSV
              </a>
            );
          })()}
          <button onClick={handleExportJSON} className="btn" style={{ border: "1px solid var(--color-secondary)", color: "var(--color-secondary)", background: "transparent", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <FileSpreadsheet size={14} /> JSON
          </button>
          <button onClick={handlePrint} className="btn" style={{ background: "var(--color-primary)", color: "#fff", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <Printer size={14} /> {lang === "tr" ? "Yazdir / PDF" : "Print / PDF"}
          </button>
        </div>
      </div>

      {/* Akademik Rapor Belgesi */}
      <div className="report-container">

        {/* Kapak */}
        <div className="report-cover">
          <div className="report-institution">{lang === "tr" ? "Müzakere Masasi Platformu" : "Deliberation Table Platform"}</div>
          <div className="report-doc-type">{lang === "tr" ? "KAMUSAL MÜZAKERE ANALIZ RAPORU" : "PUBLIC DELIBERATION ANALYSIS REPORT"}</div>
          <h1 className="report-main-title">
            {lang === "tr" ? "Müzakere Oturumu Bulgulari ve" : "Deliberation Session Findings and"}<br />
            {lang === "tr" ? "Grup Görüs Analizi" : "Group Opinion Analysis"}
          </h1>
          <div className="report-meta-grid">
            {[
              [lang === "tr" ? "Oturum Kodu" : "Session Code", sessionCode || "DEFAULT"],
              [lang === "tr" ? "Oturum Tarihi" : "Session Date", reportDate],
              [lang === "tr" ? "Baslangic Saati" : "Start Time", reportTime],
              [lang === "tr" ? "Toplam Katilimci" : "Total Participants", participantsCount],
              [lang === "tr" ? "Onaylanan Görüs" : "Approved Opinions", statementsCount],
              [lang === "tr" ? "Kutuplasma Derecesi" : "Polarization Degree", analysis?.insufficientData || analysis?.insufficientVariance ? "—" : `%${analysis?.polarisability}`],
            ].map(([label, value], i) => (
              <div key={i} className="report-meta-item">
                <span className="report-meta-label">{label}</span>
                <span className="report-meta-value">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 1. Yönetici Özeti */}
        <section className="report-section">
          <h2 className="report-section-title"><span className="report-section-num">1.</span>{lang === "tr" ? "Yönetici Özeti" : "Executive Summary"}</h2>
          <div className="report-abstract" style={{ whiteSpace: "pre-line" }}>
            {reportData.executiveSummary ? (
              <p>{reportData.executiveSummary}</p>
            ) : (
              <>
                <p>
                  {lang === "tr"
                    ? `Bu rapor, "${question}" konusunda gerçekleştirilen kamusal müzakere oturumunun bulgularını akademik bir çerçevede sunmaktadır. Oturuma ${participantsCount} katılımcı katılmış; toplam ${statementsCount} görüş moderasyon sürecinden geçerek değerlendirmeye alınmıştır.`
                    : `This report presents findings of a public deliberation session on "${question}". ${participantsCount} participants joined; ${statementsCount} opinions were evaluated after moderation.`}
                </p>
                {!analysis?.insufficientData && !analysis?.insufficientVariance && (
                  <p style={{ marginTop: "0.75rem" }}>
                    {lang === "tr"
                      ? `PCA ve K-Ortalamalar kullanılarak katılımcı görüşleri ${analysis?.camps?.length || 0} farklı fikir grubuna ayrıştırılmıştır. Kutuplaşma indeksi %${analysis?.polarisability} olarak hesaplanmıştır. ${analysis?.bridges?.length > 0 ? `Gruplar arasında ${analysis.bridges.length} uzlaşı görüşü tespit edilmiştir.` : "Gruplar arasında ortak uzlaşı noktası bulunamamıştır."}`
                      : `Using PCA and K-Means, opinions were separated into ${analysis?.camps?.length || 0} groups. Polarization index: ${analysis?.polarisability}%. ${analysis?.bridges?.length > 0 ? `${analysis.bridges.length} consensus opinion(s) found.` : "No consensus opinions found across groups."}`}
                  </p>
                )}
              </>
            )}
          </div>
        </section>

        {/* 2. Yöntem */}
        <section className="report-section">
          <h2 className="report-section-title"><span className="report-section-num">2.</span>{lang === "tr" ? "Yöntem ve Veri Toplama" : "Methodology and Data Collection"}</h2>
          <p className="report-body-text">
            {lang === "tr"
              ? "Müzakere Masasi, Polis ilhamli açik kaynak bir deliberasyon platformudur. Katilimcilar anonim ortamda görüs ekler ve oy verir. PCA ile boyutsallik indirgeme, K-Ortalamalar ile görüs kümeleme yapilmaktadir."
              : "Deliberation Table is an open-source platform inspired by Polis. Participants add opinions and vote anonymously. PCA reduces dimensionality; K-Means clusters opinion groups."}
          </p>
          <div className="report-method-grid">
            {[
              [lang === "tr" ? "PCA (Boyutsallik)" : "PCA (Dimensionality)", lang === "tr" ? "Oy matrisini 2B uzaya projeksiyon" : "Projecting vote matrix to 2D space"],
              [lang === "tr" ? "K-Ortalamalar" : "K-Means", lang === "tr" ? "Optimize k ile katilimci gruplama" : "Participant grouping with optimized k"],
              [lang === "tr" ? "Köprü Tespiti" : "Bridge Detection", lang === "tr" ? "Tüm gruplarda ≥%50 onay = uzlasi" : "≥50% approval in all groups = consensus"],
              [lang === "tr" ? "Kutuplasma Indeksi" : "Polarization Index", lang === "tr" ? "Grup merkezleri arasi agirlikli Öklid uzakligi" : "Weighted Euclidean distance between centroids"],
            ].map(([title, body], i) => (
              <div key={i} className="report-method-card">
                <div className="report-method-title">{title}</div>
                <div className="report-method-body">{body}</div>
              </div>
            ))}
          </div>
          <table className="report-table" style={{ marginTop: "1rem" }}>
            <thead>
              <tr>
                <th>{lang === "tr" ? "Metrik" : "Metric"}</th>
                <th>{lang === "tr" ? "Deger" : "Value"}</th>
                <th>{lang === "tr" ? "Yorum" : "Interpretation"}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{lang === "tr" ? "Katilim Esitligi (Gini)" : "Participation Equality (Gini)"}</td>
                <td><strong>{analysis?.participationGini !== undefined ? analysis.participationGini : "—"}</strong></td>
                <td style={{ fontSize: "0.85rem", color: "#555" }}>{analysis?.participationGini > 0.6 ? (lang === "tr" ? "⚠ Belirli kisiler yoğun görüs üretiyor" : "⚠ Few participants dominate opinion production") : (lang === "tr" ? "Dengeli katilim" : "Balanced participation")}</td>
              </tr>
              <tr>
                <td>{lang === "tr" ? "Oy Tamamlama Orani" : "Vote Completion Rate"}</td>
                <td><strong>{analysis?.voteCompletionRate !== undefined ? `%${analysis.voteCompletionRate}` : "—"}</strong></td>
                <td style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{analysis?.voteCompletionRate < 20 ? (lang === "tr" ? "⚠ Düsük tamamlama — güvenilirlik etkisi" : "⚠ Low completion — reliability impact") : (lang === "tr" ? "Yeterli oy verisi" : "Sufficient vote data")}</td>
              </tr>
              <tr>
                <td>{lang === "tr" ? "Belirsiz Katilimci" : "Ambiguous Participants"}</td>
                <td><strong>{ambiguousCount}</strong></td>
                <td style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{lang === "tr" ? "Herhangi bir gruba dahil edilemeyen" : "Not clearly assigned to any group"}</td>
              </tr>
              {showVarianceWarning && (
                <tr style={{ background: "rgba(245, 158, 11, 0.15)" }}>
                  <td colSpan={3} style={{ color: "var(--color-warning)", fontSize: "0.82rem" }}>
                    ⚠ {lang === "tr" ? `Açiklanan toplam varyans %${Math.round(totalVariance * 100)} — kümeleme sonuclari temkinli yorumlanmalidir.` : `Total explained variance is %${Math.round(totalVariance * 100)} — clustering results should be interpreted with caution.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
 
        {/* 3. Müzakere Konusu */}
        <section className="report-section">
          <h2 className="report-section-title"><span className="report-section-num">3.</span>{lang === "tr" ? "Müzakere Konusu" : "Deliberation Topic"}</h2>
          <blockquote className="report-blockquote">{question}</blockquote>
        </section>
 
        {analysis?.insufficientData ? (
          <section className="report-section">
            <div style={{ textAlign: "center", padding: "3rem 1rem", border: "1px dashed var(--border-light)", background: "var(--bg-card-hover)", borderRadius: "8px", color: "var(--text-main)" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>📊</div>
              <h4 style={{ fontSize: "1.1rem", fontWeight: "bold", marginBottom: "0.5rem", color: "var(--color-primary-text)" }}>{lang === "tr" ? "Analiz Icin Yetersiz Veri" : "Insufficient Data for Analysis"}</h4>
              <p style={{ fontSize: "0.88rem", color: "var(--text-muted)", maxWidth: "400px", margin: "0 auto", lineHeight: 1.6 }}>
                {lang === "tr" ? `En az 10 katilimci ve 5 onaylanmis görüs gerekir. (Su an: ${participantsCount} katilimci, ${statementsCount} görüs)` : `At least 10 participants and 5 approved opinions required. (Current: ${participantsCount} participants, ${statementsCount} opinions)`}
              </p>
            </div>
          </section>
        ) : (
          <>
            {/* 4. Uzlasi Görüsleri */}
            <section className="report-section">
              <h2 className="report-section-title"><span className="report-section-num">4.</span>{lang === "tr" ? "Uzlasi Görüsleri (Köprü Cümleleri)" : "Consensus Opinions (Bridge Statements)"}</h2>
              <p className="report-body-text">
                {lang === "tr" ? "Tüm fikir gruplarinda en az %50 onay oraniyla desteklenen görüsler 'uzlasi görüsü' olarak siniflandirilmaktadir. Bu ifadeler politika yapimi için ortak zemin olusturmaktadir." : "Opinions reaching at least 50% approval across all groups are classified as consensus opinions, forming common ground for policy-making."}
              </p>
              {analysis?.bridges && analysis.bridges.length > 0 ? (
                <table className="report-table">
                  <thead>
                    <tr>
                      <th style={{ width: "55%" }}>{lang === "tr" ? "Görüs Metni" : "Opinion Text"}</th>
                      <th style={{ textAlign: "center" }}>{lang === "tr" ? "Genel Onay" : "Overall Approval"}</th>
                      <th style={{ textAlign: "center" }}>{lang === "tr" ? "Min. Grup Onayi" : "Min. Group Approval"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.bridges.map((bridge, idx) => (
                      <tr key={idx}>
                        <td>
                          <div><em>"{bridge.text}"</em></div>
                          {getConsensusGroupsText(bridge) && (
                            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                              <strong>{lang === 'tr' ? 'Mutabık Gruplar: ' : 'Consensus Groups: '}</strong>
                              <span style={{ color: "var(--color-agree)", fontWeight: 600 }}>{getConsensusGroupsText(bridge)}</span>
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: "center", color: "#047857", fontWeight: "bold" }}>%{bridge.overallRate}</td>
                        <td style={{ textAlign: "center" }}>%{bridge.minApproval}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: "1.5rem", border: "1px dashed #d1d5db", textAlign: "center", color: "#6b7280", borderRadius: "8px", fontStyle: "italic" }}>
                  {lang === "tr" ? "Bu oturumda tüm gruplarca paylasilan bir uzlasi görüsüne ulasilamamistir." : "No consensus opinion shared by all groups was reached in this session."}
                </div>
              )}
            </section>

            {/* 4.1. Kutuplasmasma Etki Analizi */}
            <section className="report-section">
              <h2 className="report-section-title">
                <span className="report-section-num">4.1.</span>
                {lang === "tr" ? "Kutuplaşmaya En Çok Etki Eden Görüşler" : "Opinions with the Highest Polarization Impact"}
              </h2>
              <p className="report-body-text">
                {lang === "tr" 
                  ? "Aşağıdaki tabloda, 'leave-one-out' duyarlılık analizi yöntemiyle her görüşün genel kutuplaşma düzeyine (between/total-SS) etkisi hesaplanmıştır. Pozitif değerler ilgili görüşün gruplar arasındaki kutuplaşmayı/ayrışmayı artırdığını göstermektedir." 
                  : "The table below shows the impact of each opinion on the overall polarization level (between/total-SS) using the 'leave-one-out' sensitivity analysis. Positive values indicate that the opinion increases polarization/divergence between groups."}
              </p>
              {polarizationImpacts && polarizationImpacts.length > 0 ? (
                <table className="report-table">
                  <thead>
                    <tr>
                      <th style={{ width: "60%" }}>{lang === "tr" ? "Görüş Metni" : "Opinion Text"}</th>
                      <th style={{ textAlign: "center", width: "40%" }}>{lang === "tr" ? "Kutuplaşmaya Etkisi" : "Polarization Impact"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {polarizationImpacts.map((item, idx) => (
                      <tr key={idx}>
                        <td><em>"{item.opinionContent}"</em></td>
                        <td style={{ textAlign: "center" }}>
                          <span style={{ 
                            padding: "0.25rem 0.6rem", 
                            borderRadius: "4px", 
                            fontSize: "0.85rem",
                            fontWeight: "bold",
                            background: item.polarizationImpact > 0 ? "rgba(239, 68, 68, 0.1)" : "rgba(16, 185, 129, 0.1)",
                            color: item.polarizationImpact > 0 ? "#ef4444" : "#10b981",
                            border: item.polarizationImpact > 0 ? "1px solid rgba(239, 68, 68, 0.2)" : "1px solid rgba(16, 185, 129, 0.2)",
                            display: "inline-block",
                            marginBottom: "0.25rem"
                          }}>
                            {item.polarizationImpact > 0 ? `+${item.polarizationImpact}%` : `${item.polarizationImpact}%`}
                          </span>
                          {item.description && (
                            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                              {item.description}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: "1.5rem", border: "1px dashed var(--border-light)", textAlign: "center", color: "var(--text-muted)", borderRadius: "8px", fontStyle: "italic", background: "var(--bg-card)" }}>
                  {lang === "tr" ? "Bu oturumda kutuplaşma etki analizi için yeterli katılım veya görüş verisi bulunmamaktadır." : "Insufficient participation or opinion data for polarization impact analysis in this session."}
                </div>
              )}
            </section>

            {/* 5. Fikir Gruplari */}
            <section className="report-section">
              <h2 className="report-section-title"><span className="report-section-num">5.</span>{lang === "tr" ? "Fikir Gruplarinin Yapisi" : "Structure of Opinion Groups"}</h2>
              <p className="report-body-text">
                {lang === "tr" ? "PCA ve K-Ortalamalar ile belirlenen her grup, kendi içinde tutarli bir görüs profili sergilemektedir. Her grubun en ayirt edici görüsleri asagida tablolar halinde sunulmaktadir." : "Each group identified by PCA and K-Means exhibits a consistent internal opinion profile. The most distinguishing opinions are presented in tables below."}
              </p>
              {analysis?.camps && analysis.camps.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  {analysis.camps.map((camp, idx) => {
                    const campLetter = String.fromCharCode(65 + camp.id);
                    const pct = Math.round((camp.size / participantsCount) * 100);
                    return (
                      <div key={idx} className="report-camp-card">
                        <div className="report-camp-title">
                          {lang === "tr" ? `Grup ${campLetter}` : `Cluster ${campLetter}`}
                          <span style={{ fontWeight: 400, fontSize: "0.9rem", marginLeft: "0.75rem", color: "#6b7280" }}>— {camp.size} {lang === "tr" ? "katilimci" : "participants"} (%{pct})</span>
                        </div>
                        {camp.topStatements && camp.topStatements.length > 0 ? (
                          <table className="report-table" style={{ marginTop: "0.5rem" }}>
                            <thead>
                              <tr>
                                <th style={{ width: "75%" }}>{lang === "tr" ? "Görüs" : "Opinion"}</th>
                                <th style={{ textAlign: "center" }}>{lang === "tr" ? "Grup Ici Onay" : "Group Approval"}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {camp.topStatements.map((st, sIdx) => (
                                <tr key={sIdx}>
                                  <td><em>"{st.text}"</em></td>
                                  <td style={{ textAlign: "center", fontWeight: 600, color: "#047857" }}>%{st.approvalRate}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p style={{ color: "#9ca3af", fontStyle: "italic", fontSize: "0.85rem", marginTop: "0.5rem" }}>{lang === "tr" ? "Bu grup için yeterli görüs tespit edilemedi." : "No sufficient opinions detected for this group."}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p style={{ color: "#6b7280", fontStyle: "italic" }}>{lang === "tr" ? "Yeterli veri bulunmamaktadir." : "Insufficient data."}</p>
              )}
            </section>

            {/* 6. Kutuplasma Zaman Serisi (Ekrana Özel) */}
            <section className="report-section no-print">
              <h2 className="report-section-title"><span className="report-section-num">6.</span>{lang === "tr" ? "Kutuplasma Derecesi Zaman Serisi" : "Polarization Degree Timeline"}</h2>
              <p className="report-body-text">{lang === "tr" ? "Oturum boyunca kutuplasma oraninin kronolojik degisimi." : "Chronological change of polarization rate throughout the session."}</p>
              {analysis?.polarizationHistory && analysis.polarizationHistory.length >= 2 ? (() => {
                const history = analysis.polarizationHistory;
                const W = 520, H = 180, pL = 40, pR = 20, pT = 20, pB = 30;
                const cW = W - pL - pR, cH = H - pT - pB;
                const pts = history.map((pt, i) => ({ x: pL + (i / (history.length - 1)) * cW, y: (pT + cH) - (pt.v / 100) * cH, val: pt.v, time: pt.t }));
                const linePath = pts.map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x} ${pt.y}`).join(" ");
                return (
                  <div style={{ position: "relative", background: "var(--bg-card)", border: "1px solid var(--border-light)", padding: "1rem", borderRadius: "8px" }}>
                    {hoveredHistoryPoint && (
                      <div style={{ position: "absolute", background: "var(--color-primary)", color: "#fff", border: "1px solid var(--border-light)", padding: "0.4rem 0.75rem", borderRadius: "6px", fontSize: "0.78rem", pointerEvents: "none", left: `${Math.min(hoveredHistoryPoint.x - 50, W - 110)}px`, top: `${hoveredHistoryPoint.y - 45}px`, zIndex: 20 }}>
                        <div style={{ fontWeight: "bold", color: "var(--color-secondary)" }}>%{hoveredHistoryPoint.val} {lang === "tr" ? "Kutuplasma" : "Polarization"}</div>
                        <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "0.1rem" }}>{new Date(hoveredHistoryPoint.time).toLocaleTimeString(lang === "tr" ? "tr-TR" : "en-US")}</div>
                      </div>
                    )}
                    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
                      {[0, 25, 50, 75, 100].map(level => { const y = (pT + cH) - (level / 100) * cH; return (<g key={level}><line x1={pL} y1={y} x2={W - pR} y2={y} stroke="var(--border-light)" strokeWidth={1} /><text x={pL - 8} y={y + 4} textAnchor="end" fontSize="9" fill="var(--text-muted)">%{level}</text></g>); })}
                      <path d={linePath} fill="none" stroke="var(--color-secondary)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                      {pts.map((pt, i) => (<circle key={i} cx={pt.x} cy={pt.y} r={hoveredHistoryPoint && hoveredHistoryPoint.time === pt.time ? 6 : 4} fill={hoveredHistoryPoint && hoveredHistoryPoint.time === pt.time ? "var(--color-secondary)" : "var(--color-agree)"} stroke="#fff" strokeWidth={1.5} style={{ cursor: "pointer" }} onMouseEnter={() => setHoveredHistoryPoint(pt)} onMouseLeave={() => setHoveredHistoryPoint(null)} />))}
                    </svg>
                  </div>
                );
              })() : (
                <div style={{ padding: "2rem 1rem", border: "1px dashed var(--border-light)", textAlign: "center", color: "var(--text-muted)", borderRadius: "8px", fontStyle: "italic" }}>
                  {lang === "tr" ? "Grafik için en az 2 analiz döngüsü gerekir." : "At least 2 analysis cycles required for chart."}
                </div>
              )}
            </section>
          </>
        )}

        {/* 7. Katilimci Listesi (Ek) */}
        <section className="report-section">
          <h2 className="report-section-title">
            <span className="report-section-num">{analysis?.insufficientData ? "4." : "7."}</span>
            {lang === "tr" ? "Ek: Katilimci Listesi ve Katilim Gerekçeleri" : "Annex: Participant List and Justifications"}
          </h2>
          <p className="report-body-text">
            {lang === "tr" ? "Katilimcilarin katilim gerekçeleri ve kimlik türleri süreç seffafligi için asagida yer almaktadir." : "Participation justifications and identity types are listed below for process transparency."}
          </p>
          <table className="report-table">
            <thead>
              <tr>
                <th style={{ width: "20%" }}>{lang === "tr" ? "Kullanici Adi" : "Username"}</th>
                <th>{lang === "tr" ? "Katilim Gerekçesi" : "Participation Justification"}</th>
                <th style={{ width: "12%", textAlign: "center" }}>{lang === "tr" ? "Tür" : "Type"}</th>
              </tr>
            </thead>
            <tbody>
              {participants && participants.map((p, idx) => (
                <tr key={idx}>
                  <td><strong>{p.nickname}</strong></td>
                  <td style={{ fontSize: "0.88rem", fontStyle: "italic", color: "var(--text-main)" }}>"{p.justification || (lang === "tr" ? "Belirtilmemis." : "Not specified.")}"</td>
                  <td style={{ textAlign: "center" }}>
                    <span style={{ background: p.isBot ? "rgba(59, 130, 246, 0.15)" : "rgba(168, 85, 247, 0.15)", color: p.isBot ? "#60a5fa" : "#c084fc", padding: "0.15rem 0.5rem", borderRadius: "4px", fontSize: "0.78rem", fontWeight: 600 }}>
                      {p.isBot ? (lang === "tr" ? "Simülasyon" : "Simulation") : (lang === "tr" ? "Gerçek" : "User")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Alt Bilgi */}
        <div className="report-footer">
          <div>{lang === "tr" ? "Müzakere Masasi Platformu" : "Deliberation Table Platform"} — {lang === "tr" ? "Gizlilik Korumali Analiz Raporu" : "Privacy-Protected Analysis Report"}</div>
          <div style={{ marginTop: "0.25rem", color: "var(--text-muted)" }}>
            {lang === "tr" ? "Oturum" : "Session"}: {sessionCode || "DEFAULT"} · {reportDate} {reportTime}
          </div>
          <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>
            {lang === "tr" ? "Bu rapor otomatik olusturulmustur. Icerik katilimci görüslerini yansitmakta olup platform görüslerini temsil etmemektedir." : "Auto-generated report. Content reflects participant opinions and does not represent platform views."}
          </div>
        </div>
      </div>
    </div>
  );
}
