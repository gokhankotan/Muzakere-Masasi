import React, { useState } from 'react';
import { Users, FileText, Split, CheckCircle2, AlertCircle } from 'lucide-react';
import { t } from '../i18n';

const CAMP_COLORS = ["#FF5733", "#33FF57", "#3357FF"];

export default function LiveScreen({ question, analysis, stats, status = 'active', lang = 'tr' }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);

  // insufficientData durumunda harita yerine bilgilendirme gösterilir
  const isInsufficient = analysis?.insufficientData === true;
  const points = isInsufficient ? [] : (analysis?.points || []);
  const camps = isInsufficient ? [] : (analysis?.camps || []);
  const bridges = isInsufficient ? [] : (analysis?.bridges || []);
  const polarisability = isInsufficient ? 0 : (analysis?.polarisability || 0);

  // Varyans açıklama oranı uyarısı
  const varianceExplained = analysis?.varianceExplained || [];
  const totalVariance = varianceExplained.reduce((s, v) => s + v, 0);
  const showVarianceWarning = !isInsufficient && varianceExplained.length > 0 && totalVariance < 0.40;

  const getConsensusGroupsText = (bridge) => {
    if (!bridge.campApprovalRates || !camps || camps.length === 0) return '';
    const approvedCamps = camps
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
    <div className="live-layout">
      {/* Sol Sütun: Canlı Görselleştirme Haritası ve Kamp Detayları */}
      <div className="live-left glass-panel">
        <h2 style={{ fontSize: '1.4rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Split size={20} className="text-secondary" />
          {t('liveTitle', lang)}
        </h2>
        
        <div style={{ display: 'flex', justifyContent: 'center', margin: '1rem 0' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '540px', gap: '0.75rem' }}>
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', width: '100%', gap: '0.75rem' }}>
              <div className="chart-wrapper" style={{ flex: 1, position: 'relative' }}>
            {hoveredPoint && (
              <div style={{
                position: 'absolute',
                left: '50%',
                top: '10px',
                transform: 'translateX(-50%)',
                background: 'rgba(15, 10, 28, 0.95)',
                border: '1px solid var(--border-glow-active)',
                borderRadius: '8px',
                padding: '0.6rem 1rem',
                zIndex: 10,
                width: '90%',
                maxWidth: '280px',
                pointerEvents: 'none',
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                fontSize: '0.8rem',
                textAlign: 'left'
              }}>
                <div style={{ fontWeight: 'bold', color: CAMP_COLORS[hoveredPoint.campId] || 'var(--color-primary)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{hoveredPoint.nickname}</span>
                  <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>{hoveredPoint.isBot ? 'Bot' : (lang === 'tr' ? 'Katılımcı' : 'Participant')}</span>
                </div>
                {hoveredPoint.justification && (
                  <div style={{ marginTop: '0.4rem', color: 'var(--text-muted)', fontStyle: 'italic', wordBreak: 'break-word', lineHeight: 1.3 }}>
                    "{hoveredPoint.justification}"
                  </div>
                )}
                <div style={{ fontSize: '0.7rem', marginTop: '0.4rem', color: 'var(--text-muted)', display: 'flex', gap: '0.8rem' }}>
                  <span>X: {hoveredPoint.x}</span>
                  <span>Y: {hoveredPoint.y}</span>
                </div>
              </div>
            )}

            {isInsufficient ? (
              /* === YETERSİZ VERİ UYARI BLOĞU === */
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem',
                minHeight: '320px',
                padding: '2rem',
                background: 'rgba(168, 85, 247, 0.05)',
                border: '1px dashed rgba(168, 85, 247, 0.3)',
                borderRadius: 'var(--radius-md)',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '2.5rem' }}>📊</div>
                <p style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-primary)' }}>
                  {lang === 'tr' ? 'Anlamlı analiz için daha fazla katılım gerekli' : 'More participation needed for meaningful analysis'}
                </p>
                {(analysis.participantsNeeded > 0 || analysis.opinionsNeeded > 0) && (
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                    {analysis.participantsNeeded > 0 && (
                      <span style={{
                        background: 'rgba(168,85,247,0.15)',
                        border: '1px solid rgba(168,85,247,0.35)',
                        borderRadius: '999px',
                        padding: '0.25rem 0.85rem',
                        fontSize: '0.82rem',
                        color: '#c084fc'
                      }}>
                        +{analysis.participantsNeeded} {lang === 'tr' ? 'katılımcı' : 'participants'}
                      </span>
                    )}
                    {analysis.opinionsNeeded > 0 && (
                      <span style={{
                        background: 'rgba(99,102,241,0.15)',
                        border: '1px solid rgba(99,102,241,0.35)',
                        borderRadius: '999px',
                        padding: '0.25rem 0.85rem',
                        fontSize: '0.82rem',
                        color: '#818cf8'
                      }}>
                        +{analysis.opinionsNeeded} {lang === 'tr' ? 'onaylı görüş' : 'approved opinions'}
                      </span>
                    )}
                  </div>
                )}
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: '280px', lineHeight: 1.5 }}>
                  {lang === 'tr'
                    ? `Şu an: ${analysis.currentParticipants} katılımcı, ${analysis.currentOpinions} onaylı görüş`
                    : `Currently: ${analysis.currentParticipants} participants, ${analysis.currentOpinions} approved opinions`}
                </p>
              </div>
            ) : (
              <svg viewBox="0 0 400 400" className="chart-svg">
                {/* Kamp Centroid Arka Plan Işımaları */}
                {camps.map((camp, idx) => (
                  <circle
                    key={`glow-${idx}`}
                    cx={200 + camp.x * 2}
                    cy={200 - camp.y * 2}
                    r={camp.size > 0 ? 40 : 0}
                    fill={CAMP_COLORS[camp.id]}
                    opacity={0.08}
                  />
                ))}

                {/* Grid Çizgileri */}
                <line x1="100" y1="0" x2="100" y2="400" stroke="var(--border-light)" strokeWidth="0.5" strokeDasharray="3,3" opacity="0.4" />
                <line x1="300" y1="0" x2="300" y2="400" stroke="var(--border-light)" strokeWidth="0.5" strokeDasharray="3,3" opacity="0.4" />
                <line x1="0" y1="100" x2="400" y2="100" stroke="var(--border-light)" strokeWidth="0.5" strokeDasharray="3,3" opacity="0.4" />
                <line x1="0" y1="300" x2="400" y2="300" stroke="var(--border-light)" strokeWidth="0.5" strokeDasharray="3,3" opacity="0.4" />

                {/* Grid Koordinat İşaretleri */}
                <text x="100" y="392" fill="var(--text-muted)" fontSize="7" opacity="0.6" textAnchor="middle">-50</text>
                <text x="300" y="392" fill="var(--text-muted)" fontSize="7" opacity="0.6" textAnchor="middle">+50</text>
                <text x="5" y="105" fill="var(--text-muted)" fontSize="7" opacity="0.6" textAnchor="start">+50</text>
                <text x="5" y="305" fill="var(--text-muted)" fontSize="7" opacity="0.6" textAnchor="start">-50</text>

                {/* Eksenler */}
                <line x1="200" y1="0" x2="200" y2="400" className="chart-axis" />
                <line x1="0" y1="200" x2="400" y2="200" className="chart-axis" />



                {/* Katılımcı Noktaları */}
                {points.map((pt) => {
                  const cx = 200 + pt.x * 2;
                  const cy = 200 - pt.y * 2;
                  return (
                    <circle
                      key={pt.id}
                      cx={cx}
                      cy={cy}
                      r={pt.isBot ? 4 : 6}
                      fill={CAMP_COLORS[pt.campId] || '#999'}
                      className="chart-point"
                      opacity={pt.isBot ? 0.7 : 0.95}
                      onMouseEnter={() => setHoveredPoint(pt)}
                      onMouseLeave={() => setHoveredPoint(null)}
                      style={{ cursor: 'pointer' }}
                    />
                  );
                })}

                {/* Centroid Etiketleri */}
                {camps.map((camp, idx) => {
                  if (camp.size === 0) return null;
                  const cx = 200 + camp.x * 2;
                  const cy = 200 - camp.y * 2;
                  return (
                    <g key={`centroid-${idx}`}>
                      <circle
                        cx={cx}
                        cy={cy}
                        r={10}
                        fill={CAMP_COLORS[camp.id]}
                        stroke="#fff"
                        strokeWidth={1.5}
                        style={{ filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.5))' }}
                      />
                      <text
                        x={cx}
                        y={cy - 16}
                        fill="#ffffff"
                        fontSize="11"
                        fontWeight="800"
                        textAnchor="middle"
                        style={{ textShadow: '0 2px 6px #000' }}
                      >
                        {lang === 'tr' ? `Grup ${String.fromCharCode(65 + camp.id)}` : `Cluster ${String.fromCharCode(65 + camp.id)}`}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}

            {/* Varyans Uyarısı */}
            {showVarianceWarning && (
              <div style={{
                marginTop: '0.6rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.45rem 0.85rem',
                background: 'rgba(234,179,8,0.1)',
                border: '1px solid rgba(234,179,8,0.3)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.76rem',
                color: '#fbbf24'
              }}>
                <span>⚠️</span>
                <span>
                  {lang === 'tr'
                    ? `Bu harita görüş çeşitliliğinin sınırlı bir kısmını yansıtıyor (%${Math.round(totalVariance * 100)})`
                    : `This map reflects only a limited portion of opinion diversity (${Math.round(totalVariance * 100)}%)`}
                </span>
              </div>
            )}
          </div>
          {analysis?.axisLabels && !isInsufficient && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '0.6rem 0.8rem',
              background: 'rgba(99, 102, 241, 0.08)',
              border: '1px solid var(--border-light)',
              borderRadius: '8px',
              maxWidth: '130px',
              textAlign: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
              gap: '0.2rem'
            }}>
              <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 'bold', letterSpacing: '0.05em' }}>
                {lang === 'tr' ? 'Dikey Eksen (Y)' : 'Vertical Axis (Y)'}
              </span>
              <span style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--color-primary-text)' }}>
                {analysis.axisLabels.y}
              </span>
            </div>
          )}
        </div>
        {analysis?.axisLabels && !isInsufficient && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '0.6rem 1rem',
            background: 'rgba(99, 102, 241, 0.08)',
            border: '1px solid var(--border-light)',
            borderRadius: '8px',
            textAlign: 'center',
            width: '100%',
            maxWidth: '480px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
            marginTop: '0.5rem',
            gap: '0.2rem'
          }}>
            <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 'bold', letterSpacing: '0.05em' }}>
              {lang === 'tr' ? 'Yatay Eksen (X)' : 'Horizontal Axis (X)'}
            </span>
            <span style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--color-primary-text)' }}>
              {analysis.axisLabels.x}
            </span>
          </div>
        )}
      </div>
    </div>

        {/* Kamp Bazlı Karakteristikler */}
        <div style={{ marginTop: '1rem' }}>
          <h3 style={{ fontSize: '1rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>{t('liveTrends', lang)}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {camps.map((camp, idx) => {
              if (camp.size === 0) return null;
              const campLetter = String.fromCharCode(65 + camp.id);
              return (
                <div key={idx} style={{ borderLeft: `3px solid ${CAMP_COLORS[camp.id]}`, paddingLeft: '0.75rem' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: CAMP_COLORS[camp.id] }}>
                    {lang === 'tr' ? `Grup ${campLetter}` : `Cluster ${campLetter}`} ({camp.size} {lang === 'tr' ? 'Katılımcı' : 'Participants'})
                  </div>
                  {camp.topStatements && camp.topStatements.length > 0 ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '0.2rem' }}>
                      {lang === 'tr' ? 'En çok ayrıştığı görüş:' : 'Key defining statement:'} "{camp.topStatements[0].text}" ({lang === 'tr' ? 'Grup onayı' : 'Cluster approval'}: %{camp.topStatements[0].approvalRate})
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      {t('liveTrendsEmpty', lang)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sağ Sütun: Başlık, İstatistikler ve Köprü Cümleleri */}
      <div className="live-right">
        {/* Soru Paneli */}
        <div className="glass-panel live-question-header" style={{ position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-primary)', fontWeight: 700 }}>
              {t('liveStatsLabel', lang)}
            </span>
            {status === 'paused' && (
              <span style={{
                background: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid rgba(239, 68, 68, 0.5)',
                color: '#f87171',
                padding: '0.2rem 0.6rem',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem'
              }}>
                {t('adminStatusPausedLabel', lang)}
              </span>
            )}
          </div>
          <h1 className="live-question-title" style={{ marginTop: '0.5rem' }}>
            {question || t('liveStatsEmptyQuestion', lang)}
          </h1>
        </div>

        {/* Canlı İstatistik Kartları */}
        <div className="live-stats-row">
          <div className="stat-box glass-panel">
            <Users style={{ margin: '0 auto', color: 'var(--color-secondary)' }} size={24} />
            <div className="stat-value" style={{ marginTop: '0.25rem' }}>{stats?.participantsCount || 0}</div>
            <div className="stat-label">{t('liveStatParticipants', lang)}</div>
          </div>
          
          <div className="stat-box glass-panel">
            <FileText style={{ margin: '0 auto', color: 'var(--color-primary)' }} size={24} />
            <div className="stat-value" style={{ marginTop: '0.25rem' }}>{stats?.statementsCount || 0}</div>
            <div className="stat-label">{t('liveStatOpinions', lang)}</div>
          </div>

          <div className="stat-box glass-panel" style={{ position: 'relative' }}>
            <Split style={{ margin: '0 auto', color: 'var(--color-warning)' }} size={24} />
            {analysis?.insufficientVariance ? (
              <div className="stat-value" style={{ marginTop: '0.25rem', fontSize: '0.72rem', color: 'var(--text-muted)', padding: '0 0.5rem', minHeight: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1.2 }}>
                {lang === 'tr' ? 'Kutuplaşma hesaplanamadı (tek grup / yetersiz ayrışma)' : 'Unable to calculate polarization (insufficient variance)'}
              </div>
            ) : (
              <div className="stat-value" style={{ marginTop: '0.25rem' }}>%{polarisability}</div>
            )}
            <div className="stat-label">{t('liveStatPolarization', lang)}</div>
            
            {showVarianceWarning && (
              <div style={{
                fontSize: '0.68rem',
                color: '#fbbf24',
                marginTop: '0.4rem',
                borderTop: '1px solid var(--border-light)',
                paddingTop: '0.4rem',
                lineHeight: 1.2
              }}>
                {lang === 'tr'
                  ? `Bu oran sınırlı bir varyansa (%${Math.round(totalVariance * 100)}) dayanıyor, temkinli yorumlayın.`
                  : `This rate is based on limited variance (%${Math.round(totalVariance * 100)}), interpret with caution.`}
              </div>
            )}
          </div>
        </div>

        {/* Köprü Cümleleri (Uzlaşı Paydaları) */}
        <div className="glass-panel" style={{ flex: 1 }}>
          <h2 style={{ fontSize: '1.25rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle2 size={20} className="text-agree" />
            {t('liveBridgesTitle', lang)}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            {t('liveBridgesDesc', lang)}
          </p>

          {bridges.length > 0 ? (
            <div className="bridge-list">
              {bridges.slice(0, 4).map((bridge, index) => (
                <div key={bridge.id || index} className="bridge-item">
                  <div style={{ fontSize: '1.05rem', fontWeight: 500, lineHeight: 1.4 }}>
                    "{bridge.text}"
                  </div>
                  <div className="bridge-meta" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className="bridge-tag">{lang === 'tr' ? 'Ortak Mutabakat' : 'Common Consensus'}</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{lang === 'tr' ? 'Ortalama Onay' : 'Average Approval'}: %{bridge.overallRate}</span>
                    </div>
                    {getConsensusGroupsText(bridge) && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        <strong>{lang === 'tr' ? 'Mutabık Gruplar: ' : 'Consensus Groups: '}</strong>
                        <span style={{ color: 'var(--color-agree)', fontWeight: 600 }}>{getConsensusGroupsText(bridge)}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '4rem 1rem' }}>
              <AlertCircle size={32} style={{ color: 'var(--color-warning)', opacity: 0.8 }} />
              <p style={{ fontWeight: 500 }}>{lang === 'tr' ? 'Henüz ortak mutabakat sağlanan köprü cümle bulunamadı.' : 'No consensus bridge statement found yet.'}</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {lang === 'tr' 
                  ? 'Katılımcılar oy verdikçe ve farklı görüşleri onayladıkça, sistem kampları birleştiren ortak köprüleri burada listeler.' 
                  : 'As participants vote and approve different opinions, the system lists consensus points here.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
