import React, { useState } from 'react';
import { Send, ThumbsUp, ThumbsDown, EyeOff, MapPin, Sparkles, ShieldCheck, Check, X, Lock, Globe, ChevronDown, ChevronUp, Shield } from 'lucide-react';
import { t } from '../i18n';

const getCampColor = (campId, totalCamps) => {
  const K = totalCamps && totalCamps > 0 ? totalCamps : 3;
  const hue = Math.round((360 / K) * (campId % K));
  return `hsl(${hue}, 75%, 50%)`;
};

export default function Participant({ 
  participant, 
  statements, 
  analysis, 
  onSubmitStatement, 
  onVote, 
  onLogout,
  isModerator,
  sessionCode,
  moderationQueue,
  onApproveStatement,
  onRejectStatement,
  lang = 'tr',
  visibility = 'PUBLIC',
  passwordText = null
}) {
  const [newOpinion, setNewOpinion] = useState('');
  const [submitStatus, setSubmitStatus] = useState('');
  const [modPanelOpen, setModPanelOpen] = useState(true);
  const [accessVisibility, setAccessVisibility] = useState(visibility);
  const [accessPassword, setAccessPassword] = useState('');
  const [accessMsg, setAccessMsg] = useState('');

  React.useEffect(() => {
    setAccessVisibility(visibility);
  }, [visibility]);
  const [accessError, setAccessError] = useState('');

  // Henüz oy verilmemiş görüşler
  const unvotedStatements = statements.filter(st => participant.votes[st.id] === undefined);

  // Kamp Ataması Açıklama Paneli State'leri
  const [showExplanation, setShowExplanation] = useState(false);
  const [campExplanation, setCampExplanation] = useState(null);
  const [loadingExplanation, setLoadingExplanation] = useState(false);
  const [explanationError, setExplanationError] = useState(null);

  const toggleExplanation = async () => {
    if (showExplanation) {
      setShowExplanation(false);
      return;
    }
    setShowExplanation(true);
    setExplanationError(null);

    if (!campExplanation && participant?.id) {
      setLoadingExplanation(true);
      const code = sessionCode || 'DEFAULT';
      const token = localStorage.getItem(`session_token_${code}`) || participant?.token;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      try {
        console.log(`📡 [FETCH CAMP EXPLANATION] Katılımcı ${participant.id} (Oturum: ${code})…`);
        const res = await fetch(`/api/sessions/${code}/participants/${participant.id}/camp-explanation`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        console.log(`📥 [CAMP EXPLANATION RESPONSE] Status: ${res.status} ${res.statusText}`);

        let data = {};
        try {
          data = await res.json();
        } catch (jsonErr) {
          console.error('Failed to parse JSON response:', jsonErr);
        }

        if (res.ok && data.success) {
          setCampExplanation(data.explanation);
          setExplanationError(null);
        } else {
          const errMsg = data.message || `HTTP ${res.status}: ${res.statusText || (lang === 'tr' ? 'Açıklama şu anda yüklenemedi' : 'Unable to load explanation')}`;
          console.warn(`⚠️ [CAMP EXPLANATION ERROR] ${errMsg}`);
          setExplanationError(errMsg);
        }
      } catch (err) {
        clearTimeout(timeoutId);
        console.error('❌ [CAMP EXPLANATION FETCH CATCH]', err);
        if (err.name === 'AbortError') {
          setExplanationError(lang === 'tr' ? 'Açıklama yükleme zaman aşımına uğradı (15s). Sunucu yanıt vermedi.' : 'Explanation request timed out (15s). Server did not respond.');
        } else {
          setExplanationError(lang === 'tr' ? `Bağlantı hatası: ${err.message}` : `Connection error: ${err.message}`);
        }
      } finally {
        setLoadingExplanation(false);
      }
    }
  };

  const handleOpinionSubmit = (e) => {
    e.preventDefault();
    if (!newOpinion.trim()) return;

    onSubmitStatement(newOpinion.trim(), (res) => {
      if (res.success) {
        setNewOpinion('');
        setSubmitStatus(t('partFormSubmitStatus', lang));
        setTimeout(() => setSubmitStatus(''), 5000);
      } else {
        setSubmitStatus(`${t('partFormSubmitError', lang)} ${res.message}`);
      }
    });
  };

  const handleVoteAction = (statementId, voteValue) => {
    onVote(statementId, voteValue);
  };

  // Moderatör Erişim Ayarları Güncelleme
  const handleAccessUpdate = async (e) => {
    e.preventDefault();
    setAccessMsg('');
    setAccessError('');
    const moderatorToken = localStorage.getItem(`moderator_token_${sessionCode}`);
    if (!moderatorToken) {
      return setAccessError(t('partModTokenError', lang));
    }
    try {
      const res = await fetch(`/api/sessions/${sessionCode}/password`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${moderatorToken}`
        },
        body: JSON.stringify({ visibility: accessVisibility, password: accessPassword })
      });
      const data = await res.json();
      if (!res.ok) return setAccessError(data.message || t('partModUpdateFailed', lang));
      setAccessMsg(t('partModAccessSuccess', lang));
      setAccessPassword('');
      setTimeout(() => setAccessMsg(''), 4000);
    } catch {
      setAccessError(t('partModConnError', lang));
    }
  };

  const isInsufficient = analysis?.insufficientData === true;
  const myPoint = isInsufficient ? undefined : analysis?.points?.find(pt => pt.id === participant.id);
  const myCamp = myPoint !== undefined ? analysis?.camps?.find(c => c.id === myPoint.campId) : null;
  const renderPoints = isInsufficient ? [] : (analysis?.points || []);
  const camps = isInsufficient ? [] : (analysis?.camps || []);
  const minorityInsights = isInsufficient ? [] : (analysis?.minorityInsights || []);

  // Varyans uyarısı
  const varianceExplained = analysis?.varianceExplained || [];
  const totalVariance = varianceExplained.reduce((s, v) => s + v, 0);
  const showVarianceNote = !isInsufficient && varianceExplained.length > 0 && totalVariance < 0.40;

  return (
    <div className="participant-layout">
      {/* Sol Panel: Oylama + Moderatör Paneli */}
      <div className="voting-section">

        {/* === MODERATÖR KONTROL PANELİ === */}
        {isModerator && (
          <div className="glass-panel" style={{ border: '1px solid var(--border-light)', background: 'var(--bg-card-hover)' }}>
            <div 
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: modPanelOpen ? '1.25rem' : 0 }}
              onClick={() => setModPanelOpen(!modPanelOpen)}
            >
              <h2 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-primary)' }}>
                <ShieldCheck size={18} />
                {t('partModPanel', lang)}
                <span style={{ background: 'rgba(29, 78, 216, 0.1)', border: '1px solid rgba(29, 78, 216, 0.2)', borderRadius: '999px', padding: '0.1rem 0.6rem', fontSize: '0.7rem', color: 'var(--color-secondary)' }}>
                  {(moderationQueue || []).length} {t('partModQueue', lang)}
                </span>
              </h2>
              {modPanelOpen ? <ChevronUp size={16} color="var(--color-secondary)" /> : <ChevronDown size={16} color="var(--color-secondary)" />}
            </div>

            {modPanelOpen && (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px dashed var(--border-light)' }}>
                  <span><strong>{lang === 'tr' ? 'Oturum Kodu:' : 'Session Code:'}</strong> <code style={{ fontSize: '0.9rem', color: 'var(--text-main)', background: 'var(--bg-main)', border: '1px solid var(--border-light)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>{sessionCode}</code></span>
                  {visibility === 'PASSWORD_PROTECTED' && passwordText && (
                    <span><strong>{lang === 'tr' ? 'Masa Şifresi:' : 'Table Password:'}</strong> <code style={{ fontSize: '0.9rem', color: 'var(--color-secondary)', background: 'var(--bg-main)', border: '1px solid var(--border-light)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>{passwordText}</code></span>
                  )}
                  {visibility === 'PUBLIC' && (
                    <span><strong>{lang === 'tr' ? 'Masa Şifresi:' : 'Table Password:'}</strong> <code style={{ fontSize: '0.9rem', color: 'var(--color-agree)', background: 'var(--bg-main)', border: '1px solid var(--border-light)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>{lang === 'tr' ? 'Herkese Açık' : 'Public'}</code></span>
                  )}
                </div>

                {/* Bekleyen Görüşler Kuyruğu */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem', fontWeight: 600 }}>
                    {t('partModPendingTitle', lang)}
                  </p>
                  {(moderationQueue || []).length === 0 ? (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      {t('partModPendingEmpty', lang)}
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {(moderationQueue || []).map(opinion => (
                        <div key={opinion.id} style={{ 
                          background: 'rgba(0,0,0,0.25)', 
                          borderRadius: 'var(--radius-md)', 
                          padding: '0.75rem',
                          border: '1px solid var(--border-light)'
                        }}>
                          <p style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>"{opinion.text}"</p>
                          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
                            {t('partModAuthorLabel', lang)} {opinion.author}
                          </p>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button 
                              onClick={() => onApproveStatement(opinion.id)}
                              className="btn btn-agree" 
                              style={{ flex: 1, padding: '0.35rem 0.5rem', fontSize: '0.78rem' }}
                            >
                              <Check size={14} /> {t('partBtnApprove', lang)}
                            </button>
                            <button 
                              onClick={() => onRejectStatement(opinion.id)}
                              className="btn btn-disagree" 
                              style={{ flex: 1, padding: '0.35rem 0.5rem', fontSize: '0.78rem' }}
                            >
                              <X size={14} /> {t('partBtnReject', lang)}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Masa Erişim Ayarları */}
                <div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem', fontWeight: 600 }}>
                    {t('partModAccessTitle', lang)}
                  </p>

                  {visibility === 'PASSWORD_PROTECTED' && passwordText && (
                    <div style={{ background: 'var(--color-primary-glow)', border: '1px solid var(--border-light)', padding: '0.75rem', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span><strong>{lang === 'tr' ? 'Aktif Masa Şifresi:' : 'Active Table Password:'}</strong> <code style={{ fontSize: '1rem', color: 'var(--color-primary)', background: 'var(--bg-main)', border: '1px solid var(--border-light)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>{passwordText}</code></span>
                    </div>
                  )}

                  {accessMsg && (
                    <div style={{ background: 'rgba(21, 115, 71, 0.1)', border: '1px solid var(--color-agree)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
                      {accessMsg}
                    </div>
                  )}
                  {accessError && (
                    <div style={{ background: 'var(--color-disagree-glow)', border: '1px solid var(--color-disagree)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
                      {accessError}
                    </div>
                  )}

                  <form onSubmit={handleAccessUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    <select 
                      className="form-input" 
                      value={accessVisibility}
                      onChange={(e) => setAccessVisibility(e.target.value)}
                      style={{ background: 'var(--bg-card)', color: 'var(--text-main)', fontSize: '0.85rem', padding: '0.5rem' }}
                    >
                      <option value="PUBLIC">{t('lobbyVisibilityPublic', lang)}</option>
                      <option value="PASSWORD_PROTECTED">{t('lobbyVisibilityPrivate', lang)}</option>
                    </select>

                    {accessVisibility === 'PASSWORD_PROTECTED' && (
                      <input 
                        type="password"
                        className="form-input"
                        placeholder={t('partModNewPassPlaceholder', lang)}
                        value={accessPassword}
                        onChange={(e) => setAccessPassword(e.target.value)}
                        style={{ fontSize: '0.85rem', padding: '0.5rem' }}
                      />
                    )}

                    <button type="submit" className="btn btn-secondary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', borderColor: 'var(--color-secondary)', color: 'var(--color-secondary)' }}>
                      {t('partModAccessSave', lang)}
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        )}

        {/* Görüş Yazma Kutusu */}
        <div className="glass-panel">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles size={18} className="text-secondary" />
            {t('partFormSubmitTitle', lang)}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            {t('partFormSubmitDesc', lang)}
          </p>

          <form onSubmit={handleOpinionSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder={t('partFormSubmitPlaceholder', lang)}
              value={newOpinion}
              onChange={(e) => setNewOpinion(e.target.value)}
              maxLength={750}
              required
            ></textarea>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className={`char-counter ${newOpinion.length > 700 ? 'warning' : ''}`}>
                {newOpinion.length} / 750 {t('partCharCounter', lang)}
              </span>
              <button type="submit" className="btn" disabled={!newOpinion.trim()}>
                <Send size={16} /> {t('partFormSubmitBtn', lang)}
              </button>
            </div>
          </form>

          {submitStatus && (
            <div style={{
              marginTop: '1rem',
              padding: '0.75rem',
              background: submitStatus.includes('Hata') ? 'var(--color-disagree-glow)' : 'var(--color-primary-glow)',
              border: `1px solid ${submitStatus.includes('Hata') ? 'var(--color-disagree)' : 'var(--color-primary)'}`,
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem'
            }}>
              {submitStatus}
            </div>
          )}
        </div>

        {/* Oylama Paneli */}
        <div className="glass-panel vote-card">
          {unvotedStatements.length > 0 ? (
            <>
              <div>
                <div className="vote-card-header">
                  <span>{t('partVoteTitle', lang)}</span>
                  <span>{t('partVoteLeft', lang, { count: unvotedStatements.length })}</span>
                </div>

                <div className="vote-card-content">
                  "{unvotedStatements[0].text}"
                </div>
              </div>

              <div>
                <div className="vote-actions">
                  <button onClick={() => handleVoteAction(unvotedStatements[0].id, 1)} className="btn btn-agree">
                    <ThumbsUp size={18} /> {t('partVoteAgree', lang)}
                  </button>
                  <button onClick={() => handleVoteAction(unvotedStatements[0].id, -1)} className="btn btn-disagree">
                    <ThumbsDown size={18} /> {t('partVoteDisagree', lang)}
                  </button>
                  <button onClick={() => handleVoteAction(unvotedStatements[0].id, 0)} className="btn btn-pass">
                    <EyeOff size={18} /> {t('partVotePass', lang)}
                  </button>
                </div>

                <div className="progress-bar-container">
                  <div 
                    className="progress-bar-fill"
                    style={{ width: `${((statements.length - unvotedStatements.length) / Math.max(statements.length, 1)) * 100}%` }}
                  ></div>
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state" style={{ margin: 'auto' }}>
              <div className="empty-state-icon">🎉</div>
              <h3>{t('partVoteSuccessTitle', lang)}</h3>
              <p>{t('partVoteSuccessBody', lang)}</p>
              <p style={{ fontSize: '0.85rem' }}>
                {t('partVoteSuccessNote', lang)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Sağ Panel: Konum ve Analiz Görselleştirmesi */}
      <div className="chart-container glass-panel">
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <MapPin size={18} className="text-secondary" />
          {t('partMapTitle', lang)}
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem', textAlign: 'center' }}>
          {t('partMapDesc', lang)}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: '0.75rem' }}>
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', width: '100%', gap: '0.75rem' }}>
            <div className="chart-wrapper" style={{ flex: 1 }}>
          {isInsufficient ? (
            <svg viewBox="0 0 400 400" className="chart-svg">
              <line x1="200" y1="0" x2="200" y2="400" className="chart-axis" />
              <line x1="0" y1="200" x2="400" y2="200" className="chart-axis" />
              <text x="200" y="180" fill="#a78bfa" fontSize="28" textAnchor="middle">📊</text>
              <text x="200" y="210" fill="var(--text-muted)" fontSize="11" fontWeight="600" textAnchor="middle">
                {lang === 'tr' ? 'Analiz için yeterli veri yok' : 'Insufficient data for analysis'}
              </text>
              <text x="200" y="230" fill="var(--text-main)" fontSize="9.5" textAnchor="middle">
                {lang === 'tr' 
                  ? `${analysis?.currentParticipants ?? 0} katılımcı, ${analysis?.currentOpinions ?? 0} görüş (min. 10 / 5 gerekli)` 
                  : `${analysis?.currentParticipants ?? 0} participants, ${analysis?.currentOpinions ?? 0} statements (min. 10 / 5 required)`}
              </text>
            </svg>
          ) : (
            <svg viewBox="0 0 400 400" className="chart-svg">
              {camps.map((camp, idx) => (
                <circle
                  key={`glow-${idx}`}
                  cx={200 + camp.x * 2}
                  cy={200 - camp.y * 2}
                  r={camp.size > 0 ? 35 : 0}
                  fill={getCampColor(camp.id, camps.length)}
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

              {renderPoints.map((pt) => {
                const isMe = pt.id === participant.id;
                const cx = 200 + pt.x * 2;
                const cy = 200 - pt.y * 2;
                if (isMe) return null;
                return (
                  <g key={pt.id}>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={pt.isBot ? 4 : 5.5}
                      fill={getCampColor(pt.campId, camps.length)}
                      className="chart-point"
                      opacity={pt.isBot ? 0.65 : 0.9}
                    />
                    <title>{pt.nickname} {pt.isBot ? '(Bot)' : ''}</title>
                  </g>
                );
              })}

              {myPoint && (
                <g>
                  <circle
                    cx={200 + myPoint.x * 2}
                    cy={200 - myPoint.y * 2}
                    r={8}
                    fill="#ffffff"
                    stroke={getCampColor(myPoint.campId, camps.length)}
                    strokeWidth={2}
                    className="chart-point-self"
                  />
                  <text
                    x={200 + myPoint.x * 2}
                    y={200 - myPoint.y * 2 - 12}
                    fill="var(--text-dark)"
                    fontSize="10"
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    {lang === 'tr' ? `Siz (${participant.nickname})` : `You (${participant.nickname})`}
                  </text>
                </g>
              )}

            </svg>
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

        {/* Varyans Uyarısı */}
        {showVarianceNote && (
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
            color: '#fbbf24',
            textAlign: 'left'
          }}>
            <span>⚠️</span>
            <span>
              {lang === 'tr'
                ? `Bu harita görüş çeşitliliğinin sınırlı bir kısmını yansıtıyor (%${Math.round(totalVariance * 100)})`
                : `This map reflects only a limited portion of opinion diversity (${Math.round(totalVariance * 100)}%)`}
            </span>
          </div>
        )}

        {/* Grup Bilgisi */}
        <div style={{ marginTop: '1.5rem', width: '100%', borderTop: '1px solid var(--border-light)', paddingTop: '1rem' }}>
          {myCamp ? (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                {t('partMapStatusCalculated', lang)} <span style={{ color: getCampColor(myCamp.id, camps.length) }}>{myCamp.name}</span>
              </p>
              {myCamp.summary && (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.4rem', fontStyle: 'italic' }}>
                  {myCamp.summary}
                </p>
              )}
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                {t('partMapStatusCampSize', lang, { count: Math.max(0, myCamp.size - 1) })}
              </p>

              {/* Şeffaflık Butonu: Neden Bu Kampa Konuldum? */}
              <div style={{ marginTop: '0.75rem' }}>
                <button
                  onClick={toggleExplanation}
                  style={{
                    background: 'rgba(6, 182, 212, 0.08)',
                    border: '1px solid rgba(6, 182, 212, 0.3)',
                    borderRadius: '20px',
                    padding: '0.35rem 0.85rem',
                    fontSize: '0.78rem',
                    color: '#22d3ee',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <span>🎯</span>
                  <span>{lang === 'tr' ? 'Neden bu gruptayım?' : 'Why am I in this group?'}</span>
                </button>
              </div>

              {/* Şeffaflık Paneli (Tek Renk Turkuaz Tema — Az Duyulan Argümanlar Formatında) */}
              {showExplanation && (
                <div style={{
                  marginTop: '0.75rem',
                  background: 'rgba(6, 182, 212, 0.05)',
                  border: '1px solid rgba(6, 182, 212, 0.25)',
                  borderRadius: '8px',
                  padding: '0.85rem 1rem',
                  textAlign: 'left',
                  fontSize: '0.82rem'
                }}>
                  <h4 style={{
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    color: '#22d3ee',
                    marginBottom: '0.4rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem'
                  }}>
                    <span>🎯</span>
                    <span>{lang === 'tr' ? 'Sizi Bu Kampa Yaklaştıran Oylarınız' : 'Votes Bringing You to This Group'}</span>
                  </h4>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.75rem', lineHeight: 1.4 }}>
                    {lang === 'tr'
                      ? 'Bu görüşler grubunuzun genel oy eğilimi ile en yüksek uyumu gösteren oylarınızdır.'
                      : 'These opinions show the highest vote alignment with your group.'}
                  </p>

                  {loadingExplanation ? (
                    <p style={{ fontStyle: 'italic', color: '#22d3ee', fontSize: '0.78rem' }}>
                      ⏳ {lang === 'tr' ? 'Hesaplanıyor...' : 'Calculating...'}
                    </p>
                  ) : explanationError ? (
                    <div style={{ padding: '0.5rem 0.75rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', color: '#ef4444', fontSize: '0.78rem' }}>
                      ⚠️ {explanationError}
                    </div>
                  ) : campExplanation && campExplanation.definingVotes && campExplanation.definingVotes.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      {campExplanation.definingVotes.map((vote, idx) => {
                        const isAgree = vote.userVote === 'AGREE';
                        const alignmentPct = Math.round((vote.alignmentScore || 0) * 100);

                        return (
                          <div key={vote.statementId || idx} style={{
                            background: 'rgba(6, 182, 212, 0.06)',
                            border: '1px solid rgba(6, 182, 212, 0.25)',
                            borderLeft: '3px solid #06b6d4',
                            borderRadius: '7px',
                            padding: '0.65rem 0.85rem'
                          }}>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-main)', lineHeight: 1.5, marginBottom: '0.4rem' }}>
                              "{vote.text}"
                            </div>
                            <div style={{ display: 'flex', gap: '0.6rem', fontSize: '0.72rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                              <span style={{
                                background: 'rgba(6, 182, 212, 0.15)',
                                border: '1px solid rgba(6, 182, 212, 0.3)',
                                borderRadius: '999px',
                                padding: '0.1rem 0.45rem',
                                color: '#22d3ee',
                                fontWeight: 600
                              }}>
                                {isAgree ? (
                                  <>🟢 {lang === 'tr' ? 'Katılıyorum' : 'Agreed'}</>
                                ) : (
                                  <>🔴 {lang === 'tr' ? 'Katılmıyorum' : 'Disagreed'}</>
                                )}
                              </span>

                              <span style={{
                                background: 'rgba(6, 182, 212, 0.12)',
                                border: '1px solid rgba(6, 182, 212, 0.25)',
                                borderRadius: '999px',
                                padding: '0.1rem 0.45rem',
                                color: '#38bdf8',
                                fontWeight: 600
                              }}>
                                📊 {lang === 'tr' ? `Grup Kabulü: %${vote.campApprovalRate}` : `Group Approval: %${vote.campApprovalRate}`}
                              </span>

                              {alignmentPct > 0 && (
                                <span style={{
                                  background: 'rgba(6, 182, 212, 0.18)',
                                  border: '1px solid rgba(6, 182, 212, 0.35)',
                                  borderRadius: '999px',
                                  padding: '0.1rem 0.45rem',
                                  color: '#22d3ee',
                                  fontWeight: 600
                                }}>
                                  🧠 {lang === 'tr' ? `Uyum Skoru: %${alignmentPct}` : `Alignment: %${alignmentPct}`}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ padding: '0.75rem', border: '1px dashed rgba(6, 182, 212, 0.25)', borderRadius: '7px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                      💡 {lang === 'tr'
                        ? 'Henüz grubunuza olan belirleyici oy veriniz hesaplanmadı.'
                        : 'Not enough defining vote data yet.'}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              {t('partMapStatusWait', lang)}
            </p>
          )}
        </div>

        {/* Azınlık Görüşleri Paneli (Minority Opinion Shield) */}
        <div style={{
          marginTop: '0.65rem',
          width: '100%',
          borderTop: '1px solid rgba(245, 158, 11, 0.25)',
          paddingTop: '0.65rem'
        }}>
          <h3 style={{
            fontSize: '0.95rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            marginBottom: '0.5rem',
            color: '#f59e0b'
          }}>
            <Shield size={16} style={{ color: '#f59e0b' }} />
            {lang === 'tr' ? 'Az Duyulan Ama Güçlü Argümanlar' : 'Underrepresented Strong Arguments'}
          </h3>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.75rem', lineHeight: 1.4 }}>
            {lang === 'tr'
              ? 'Bu görüşler az oy almış ancak güçlü gerekçe içeriyor.'
              : 'These opinions received few votes but contain strong reasoning.'}
          </p>

          {minorityInsights.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {minorityInsights.map((insight, idx) => (
                <div key={insight.id || idx} style={{
                  background: 'rgba(245, 158, 11, 0.06)',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                  borderLeft: '3px solid #f59e0b',
                  borderRadius: '7px',
                  padding: '0.65rem 0.85rem'
                }}>
                  <div style={{ fontSize: '0.82rem', lineHeight: 1.5, marginBottom: '0.4rem' }}>
                    "{insight.text}"
                  </div>
                  <div style={{ display: 'flex', gap: '0.6rem', fontSize: '0.72rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                    <span style={{
                      background: 'rgba(245, 158, 11, 0.15)',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      borderRadius: '999px',
                      padding: '0.1rem 0.45rem',
                      color: '#f59e0b',
                      fontWeight: 600
                    }}>
                      🧠 {lang === 'tr' ? 'Gerekçe Kalitesi' : 'Quality'}: %{insight.qualityScore}
                    </span>
                    <span>🗳️ {insight.voteCount} {lang === 'tr' ? 'Oy' : 'Votes'}</span>
                    <span>👍 %{insight.approvalRate ?? Math.round((insight.agreeCount / Math.max(1, insight.voteCount))*100)} {lang === 'tr' ? 'Onay' : 'Approval'}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '0.75rem', border: '1px dashed rgba(245, 158, 11, 0.25)', borderRadius: '7px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
              💡 {lang === 'tr'
                ? 'Henüz azınlık görüşü tespiti için yeterli gerekçeli görüş verisi yok.'
                : 'No underrepresented strong arguments detected yet.'}
            </div>
          )}
        </div>

        {/* Renk Legendı */}
        <div className="chart-legend">
          {camps.map((camp, idx) => (
            <div key={idx} className="legend-item">
              <span className="legend-dot" style={{ backgroundColor: getCampColor(camp.id, camps.length) }}></span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {camp.name} ({camp.size} {lang === 'tr' ? 'kişi' : 'people'})
              </span>
            </div>
          ))}
        </div>

        <button 
          onClick={onLogout}
          className="btn btn-secondary" 
          style={{ marginTop: '2rem', padding: '0.4rem 1rem', fontSize: '0.8rem' }}
        >
          {t('partLogout', lang)}
        </button>
      </div>
    </div>
  );
}
