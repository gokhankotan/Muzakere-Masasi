import React, { useState, useEffect } from 'react';
import { HelpCircle, Users, Check, X, Settings, FileText, Play, Shield, AlertTriangle, RefreshCw, Send, Sparkles, TrendingUp, TrendingDown } from 'lucide-react';
import { t } from '../i18n';

export default function AdminDashboard({ 
  question, 
  moderationQueue, 
  stats, 
  status = 'active',
  onUpdateSessionStatus,
  onUpdateQuestion, 
  onApproveStatement, 
  onRejectStatement, 
  onRunSimulation, 
  onResetSession, 
  onOpenLiveScreen, 
  onOpenReport,
  participants = [],
  onKickParticipant,
  targetK = 3,
  camps = [],
  onUpdateCampsCount,
  onRenameCamp,
  lang = 'tr',
  aiAccuracy = 0,
  sessionsOverview = [],
  activeSessionCode = 'DEFAULT',
  onSelectSession,
  analysis = null
}) {
  const [newQuestion, setNewQuestion] = useState(question);
  const [simCount, setSimCount] = useState(100);
  const [simStatus, setSimStatus] = useState('');
  const [resetConfirm, setResetConfirm] = useState(false);
  const [actionLogs, setActionLogs] = useState([]);
  
  // Uzlaşı Potansiyeli Keşif State'leri
  const [consensusResult, setConsensusResult] = useState('');
  const [consensusError, setConsensusError] = useState('');
  const [discoveringConsensus, setDiscoveringConsensus] = useState(false);
  const [dataFreshness, setDataFreshness] = useState(null); // { isFresh: boolean, version: number }
  const [quotaWarning, setQuotaWarning] = useState(false);
  const lastConsensusClickRef = React.useRef(0);

  // Kutuplaşma Trendi state'leri
  const [polarizationHistory, setPolarizationHistory] = useState([]);
  const [hoveredPtAdmin, setHoveredPtAdmin] = useState(null);
  const [showSimulated, setShowSimulated] = useState(false);

  const fetchActionLogs = () => {
    const token = localStorage.getItem('admin_token');
    if (!token) return;
    fetch('/api/admin/action-log', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        setActionLogs(data.logs || []);
      }
    })
    .catch(err => console.error('Action log load error:', err));
  };

  useEffect(() => {
    fetchActionLogs();
    const interval = setInterval(fetchActionLogs, 5000);
    setConsensusResult('');
    setConsensusError('');
    setDataFreshness(null);
    return () => clearInterval(interval);
  }, [activeSessionCode]);

  useEffect(() => {
    setPolarizationHistory([]);
    setHoveredPtAdmin(null);
    const token = localStorage.getItem('admin_token');
    const code = activeSessionCode || 'DEFAULT';
    const fetchHistory = () => {
      fetch(`/api/sessions/${code}/polarization-history`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      })
      .then(r => r.json())
      .then(d => { if (d.success) setPolarizationHistory(d.history || []); })
      .catch(() => {});
    };
    fetchHistory();
    const hInterval = setInterval(fetchHistory, 30000);
    return () => clearInterval(hInterval);
  }, [activeSessionCode]);

  // Kamp ismi düzenleme state'leri
  const [editingCampId, setEditingCampId] = useState(null);
  const [editingCampName, setEditingCampName] = useState('');

  // Oturum Düzenleme Modalı State'leri
  const [editingSession, setEditingSession] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editQuestion, setEditQuestion] = useState('');
  const [editStatus, setEditStatus] = useState('active');
  const [editVisibility, setEditVisibility] = useState('PUBLIC');
  const [editPassword, setEditPassword] = useState('');
  const [editError, setEditError] = useState('');
  const [editSuccess, setEditSuccess] = useState('');

  const handleOpenEditModal = (sessionObj) => {
    // Aynı oturuma tekrar tıklanınca formu kapat (toggle)
    if (editingSession && editingSession.code === sessionObj.code) {
      setEditingSession(null);
      return;
    }
    // Aktif oturumu da değiştir
    if (onSelectSession) onSelectSession(sessionObj.code);
    setEditingSession(sessionObj);
    setEditTitle(sessionObj.title || '');
    setEditDesc(sessionObj.description || '');
    setEditQuestion(sessionObj.question || '');
    setEditStatus(sessionObj.status || 'active');
    setEditVisibility(sessionObj.visibility || 'PUBLIC');
    setEditPassword(sessionObj.passwordText || '');
    setEditError('');
    setEditSuccess('');
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setEditError('');
    setEditSuccess('');
    const token = localStorage.getItem('admin_token');
    if (!token) {
      return setEditError(lang === 'tr' ? 'Oturum yetkiniz yok.' : 'Unauthorized.');
    }

    try {
      const res = await fetch(`/api/admin/sessions/${editingSession.code}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: editTitle,
          description: editDesc,
          question: editQuestion,
          status: editStatus,
          visibility: editVisibility,
          password: editPassword
        })
      });
      const data = await res.json();
      if (data.success) {
        setEditSuccess(lang === 'tr' ? 'Oturum bilgileri başarıyla güncellendi!' : 'Session updated successfully!');
        if (onUpdateQuestion && editingSession.code === activeSessionCode) {
          onUpdateQuestion(editQuestion);
        }
      } else {
        setEditError(data.message || (lang === 'tr' ? 'Güncelleme başarısız.' : 'Update failed.'));
      }
    } catch (err) {
      setEditError(lang === 'tr' ? 'Bağlantı hatası oluştu.' : 'Connection error.');
    }
  };

  const handleUpdateQuestion = (e) => {
    e.preventDefault();
    if (onUpdateQuestion) {
      onUpdateQuestion(newQuestion);
      alert(lang === 'tr' ? 'Müzakere sorusu başarıyla güncellendi!' : 'Question updated successfully!');
    }
  };

  const handleRunSimulation = (count) => {
    setSimStatus(lang === 'tr' ? `${count} bot simülasyonu başlatılıyor...` : `Starting ${count} bot simulation...`);
    onRunSimulation(count);
    setTimeout(() => {
      setSimStatus(lang === 'tr' ? `✅ ${count} bot başarıyla eklendi ve oylama tamamlandı!` : `✅ ${count} bots successfully added!`);
    }, 2000);
  };

  const handleResetSession = () => {
    if (!resetConfirm) {
      setResetConfirm(true);
      return;
    }
    onResetSession();
    setResetConfirm(false);
  };

  const handleSaveCampName = (campId) => {
    if (!editingCampName.trim()) return;
    onRenameCamp(campId, editingCampName.trim());
    setEditingCampId(null);
    setEditingCampName('');
  };

  const handleResetAllData = () => {
    if (!confirm('TÜM veritabanını sıfırlamak ve varsayılan test verilerine dönmek istediğinize emin misiniz? Bu işlem geri alınamaz!')) {
      return;
    }
    const token = localStorage.getItem('admin_token');
    fetch('/api/admin/reset-database', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(res => {
      if (res.success) {
        alert('Tüm oturum verileri sıfırlandı ve varsayılan görüşler yüklendi.');
      } else {
        alert(`Sıfırlama hatası: ${res.message}`);
      }
    });
  };

  const handleDiscoverConsensus = async () => {
    if (discoveringConsensus) return;

    // Debounce protection: Disable consecutive rapid clicks within 1000ms
    const now = Date.now();
    if (now - lastConsensusClickRef.current < 1000) {
      return;
    }
    lastConsensusClickRef.current = now;

    setConsensusError('');
    setConsensusResult('');
    setDiscoveringConsensus(true);

    const token = localStorage.getItem('admin_token') || localStorage.getItem(`moderator_token_${activeSessionCode}`);

    // Client-side AbortController ile 20 saniyelik timeout (Req 4)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      const res = await fetch(`/api/sessions/${activeSessionCode}/discover-consensus`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const data = await res.json();
      if (data.success) {
        setConsensusResult(data.consensusPotential);
        if (data.dataFreshness) {
          setDataFreshness(data.dataFreshness);
        }
        if (data.isQuotaExhausted) {
          setQuotaWarning(true);
        }
      } else {
        setConsensusError(data.message || (lang === 'tr' ? 'Uzlaşı potansiyeli keşfedilemedi.' : 'Failed to discover consensus.'));
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        setConsensusError(lang === 'tr' ? 'İstek zaman aşımına uğradı (20s). Kural tabanlı sonuç gösteriliyor.' : 'Request timed out (20s). Showing rule-based result.');
      } else {
        setConsensusError(lang === 'tr' ? 'Şu an uzlaşı potansiyeli analiz edilemedi.' : 'Currently unable to analyze consensus potential.');
      }
    } finally {
      // ⚠️ İSTİSNASIZ GARANTİ: Loading state HER ZAMAN kaldırılır!
      setDiscoveringConsensus(false);
    }
  };

  return (
    <div className="admin-container" style={{ display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: '1200px', margin: '0 auto', padding: '0 1rem 3rem 1rem' }}>
      
      {/* Aktif Yönetilen Oturum Başlık Kartı */}
      <div style={{ background: 'var(--bg-card-hover)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <Shield className="text-secondary" size={22} />
              {lang === 'tr' ? 'Sistem Yönetim Paneli' : 'System Administration Panel'}
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '0.25rem', marginBlock: 0 }}>
              {lang === 'tr' ? 'Aşağıdaki listeden oturum seçip "Düzenle" butonuna basarak düzenleme yapın.' : 'Select a session from the list below and click "Edit" to manage it.'}
            </p>
          </div>
          <div style={{ textAlign: 'right', minWidth: '150px' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>{lang === 'tr' ? 'YÖNETİLEN AKTİF OTURUM' : 'ACTIVELY MANAGED SESSION'}</span>
            <code style={{ fontSize: '1.2rem', color: 'var(--color-primary)', background: 'var(--bg-main)', padding: '0.2rem 0.6rem', borderRadius: '6px', fontWeight: 'bold', display: 'inline-block', marginTop: '0.25rem', border: '1px solid var(--border-light)' }}>
              {activeSessionCode}
            </code>
          </div>
        </div>

        {/* Inline Oturum Düzenleme Formu */}
        {editingSession && (
          <div style={{ borderTop: '1px solid var(--border-light)', padding: '1.5rem', background: 'var(--bg-card)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.1rem', color: 'var(--color-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Settings size={18} />
                {lang === 'tr' ? `Düzenleniyor: ${editingSession.code}` : `Editing: ${editingSession.code}`}
              </h2>
              <button
                onClick={() => setEditingSession(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.1rem', cursor: 'pointer', lineHeight: 1 }}
                title={lang === 'tr' ? 'Formu Kapat' : 'Close Form'}
              >
                ✕
              </button>
            </div>

            {editError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', padding: '0.6rem 0.8rem', borderRadius: 'var(--radius-md)', fontSize: '0.8rem', color: '#fca5a5', marginBottom: '1rem' }}>
                {editError}
              </div>
            )}
            {editSuccess && (
              <div style={{ background: 'rgba(52, 211, 153, 0.1)', border: '1px solid #34d399', padding: '0.6rem 0.8rem', borderRadius: 'var(--radius-md)', fontSize: '0.8rem', color: '#a7f3d0', marginBottom: '1rem' }}>
                {editSuccess}
              </div>
            )}

            <form onSubmit={handleSaveEdit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">{lang === 'tr' ? 'Masa Başlığı' : 'Title'}</label>
                  <input type="text" className="form-input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">{lang === 'tr' ? 'Açıklama' : 'Description'}</label>
                  <input type="text" className="form-input" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label">{lang === 'tr' ? 'Müzakere Sorusu' : 'Deliberation Question'}</label>
                <textarea className="form-textarea" rows={2} value={editQuestion} onChange={(e) => setEditQuestion(e.target.value)} required />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">{lang === 'tr' ? 'Erişim Türü' : 'Access'}</label>
                  <select className="form-input" value={editVisibility} onChange={(e) => setEditVisibility(e.target.value)} style={{ background: 'var(--bg-card)', color: 'var(--text-main)' }}>
                    <option value="PUBLIC">{lang === 'tr' ? '🌐 Herkese Açık' : '🌐 Public'}</option>
                    <option value="PASSWORD_PROTECTED">{lang === 'tr' ? '🔒 Şifreli' : '🔒 Protected'}</option>
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">{lang === 'tr' ? 'Durum' : 'Status'}</label>
                  <select className="form-input" value={editStatus} onChange={(e) => setEditStatus(e.target.value)} style={{ background: 'var(--bg-card)', color: 'var(--text-main)' }}>
                    <option value="active">{lang === 'tr' ? '▶️ Aktif' : '▶️ Active'}</option>
                    <option value="paused">{lang === 'tr' ? '⏸️ Durduruldu' : '⏸️ Paused'}</option>
                  </select>
                </div>
                {editVisibility === 'PASSWORD_PROTECTED' && (
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">{lang === 'tr' ? 'Giriş Şifresi' : 'Password'}</label>
                    <input type="text" className="form-input" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} required={editVisibility === 'PASSWORD_PROTECTED'} placeholder="••••••" />
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn" onClick={() => setEditingSession(null)} style={{ background: 'transparent', borderColor: 'var(--border-light)', color: 'var(--text-muted)' }}>
                  {lang === 'tr' ? 'Kapat' : 'Close'}
                </button>
                <button type="submit" className="btn" style={{ background: 'var(--color-primary)', minWidth: '160px' }}>
                  {lang === 'tr' ? '💾 Değişiklikleri Kaydet' : '💾 Save Changes'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Meta-Analiz Tablosu — Sistem Yönetim Paneli'nin Hemen Altında */}
      <div className="glass-panel" style={{ width: '100%' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          📊 {lang === 'tr' ? 'Oturumlar Arası Meta-Analiz' : 'Cross-Session Meta-Analysis'}
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
          {lang === 'tr'
            ? 'Tüm oturumların genel durum özeti. Oturum koduna tıklayarak aktif oturumu değiştirebilir, ⋯ Düzenleme butonuyla düzenleme yapabilirsiniz.'
            : 'Overview of all sessions. Click a session code to switch, or click ⋯ Edit to modify.'}
        </p>

        {sessionsOverview.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--color-primary)' }}>
                  <th style={{ padding: '0.75rem' }}>{lang === 'tr' ? 'Oturum Kodu' : 'Session Code'}</th>
                  <th style={{ padding: '0.75rem' }}>{lang === 'tr' ? 'Müzakere Sorusu' : 'Deliberation Question'}</th>
                  <th style={{ padding: '0.75rem' }}>{lang === 'tr' ? 'Katılımcı Sayısı' : 'Participants'}</th>
                  <th style={{ padding: '0.75rem' }}>{lang === 'tr' ? 'Görüş Sayısı' : 'Approved Opinions'}</th>
                  <th style={{ padding: '0.75rem' }}>{lang === 'tr' ? 'Kutuplaşma Derecesi' : 'Polarization Rate'}</th>
                  <th style={{ padding: '0.75rem' }}>{lang === 'tr' ? 'İşlemler' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {sessionsOverview.map(s => (
                  <tr key={s.code} style={{ borderBottom: '1px solid var(--border-light)', background: activeSessionCode === s.code ? 'rgba(29, 78, 216, 0.05)' : 'transparent' }}>
                    <td style={{ padding: '0.75rem' }}>
                      <button
                        onClick={() => onSelectSession && onSelectSession(s.code)}
                        className="btn-link"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: activeSessionCode === s.code ? 'var(--color-primary)' : 'var(--color-secondary)',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          padding: 0,
                          fontSize: '0.9rem'
                        }}
                        title={lang === 'tr' ? 'Yönetmek için bu oturumu seç' : 'Select this session to manage'}
                      >
                        {s.code} {s.passwordText ? ` (${lang === 'tr' ? 'Şifre' : 'Pass'}: ${s.passwordText})` : ''} {activeSessionCode === s.code ? '⭐️' : ''}
                      </button>
                    </td>
                    <td style={{ padding: '0.75rem', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.question}>{s.question}</td>
                    <td style={{ padding: '0.75rem' }}>{s.participantsCount}</td>
                    <td style={{ padding: '0.75rem' }}>{s.statementsCount}</td>
                    <td style={{ padding: '0.75rem' }}>
                      {s.polarisability !== null && s.polarisability !== undefined
                        ? `%${Math.round(s.polarisability)}`
                        : '—'}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <button
                        onClick={() => handleOpenEditModal(s)}
                        className="btn"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderColor: 'var(--color-secondary)', color: 'var(--color-secondary)', minWidth: 'auto', background: editingSession && editingSession.code === s.code ? 'rgba(29, 78, 216, 0.1)' : 'transparent' }}
                      >
                        {editingSession && editingSession.code === s.code
                          ? (lang === 'tr' ? '✕ Kapat' : '✕ Close')
                          : (lang === 'tr' ? '⚙️ Düzenle' : '⚙️ Edit')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ fontStyle: 'italic', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {lang === 'tr' ? 'Yükleniyor veya gösterilecek veri yok.' : 'Loading or no data available.'}
          </p>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
           Kutuplaşma Trendi Bento Kartı
      ════════════════════════════════════════════════════════════════ */}
      <div className="glass-panel" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              📈 {lang === 'tr' ? 'Kutuplaşma Trendi' : 'Polarization Trend'}
              <span style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid var(--border-light)', borderRadius: '999px', padding: '0.1rem 0.6rem', fontSize: '0.72rem', color: 'var(--color-secondary)', fontWeight: 600 }}>
                {activeSessionCode}
              </span>
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
              {lang === 'tr' ? 'Seçili oturumun kutuplaşma yüzdesinin zamana göre değişimi.' : 'Polarization percentage over time for the selected session.'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '0.25rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
              <input
                type="checkbox"
                checked={showSimulated}
                onChange={e => setShowSimulated(e.target.checked)}
                style={{ cursor: 'pointer', accentColor: 'var(--color-secondary)' }}
              />
              <span>🤖 {lang === 'tr' ? 'Simülasyon verilerini göster' : 'Show simulation data'}</span>
            </label>
            {/* Trend Badge */}
            {polarizationHistory.length >= 2 && (() => {
              const activeHist = showSimulated ? polarizationHistory : polarizationHistory.filter(pt => !pt.isSimulated);
              if (activeHist.length < 2) return null;
              const first = activeHist[0].v;
              const last  = activeHist[activeHist.length - 1].v;
              const diff  = last - first;
              if (diff > 1) return (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '999px', padding: '0.3rem 0.85rem', fontSize: '0.82rem', fontWeight: 700 }}>
                  <TrendingUp size={14} /> {lang === 'tr' ? `↑ Artıyor (+${diff.toFixed(1)}%)` : `↑ Rising (+${diff.toFixed(1)}%)`}
                </span>
              );
              if (diff < -1) return (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '999px', padding: '0.3rem 0.85rem', fontSize: '0.82rem', fontWeight: 700 }}>
                  <TrendingDown size={14} /> {lang === 'tr' ? `↓ Azalıyor (${diff.toFixed(1)}%)` : `↓ Decreasing (${diff.toFixed(1)}%)`}
                </span>
              );
              return (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: 'rgba(100,116,139,0.1)', color: '#94a3b8', border: '1px solid rgba(100,116,139,0.2)', borderRadius: '999px', padding: '0.3rem 0.85rem', fontSize: '0.82rem', fontWeight: 700 }}>
                  → {lang === 'tr' ? 'Sabit' : 'Stable'}
                </span>
              );
            })()}
          </div>
        </div>

        {(() => {
          const hist = showSimulated ? polarizationHistory : polarizationHistory.filter(pt => !pt.isSimulated);
          if (hist.length < 2) return (
            <div style={{ padding: '2.5rem 1rem', border: '1px dashed var(--border-light)', borderRadius: '8px', textAlign: 'center', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '2rem', opacity: 0.4 }}>📈</span>
              <p style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                {lang === 'tr' ? 'Gösterilecek en az 2 gerçek katılımcı analiz kaydı gerekir.' : 'At least 2 real participant analysis snapshots required.'}
              </p>
              <p style={{ fontSize: '0.78rem', opacity: 0.7 }}>
                {lang === 'tr' ? 'Katılımcılar oy verdikçe sistem otomatik kaydeder.' : 'The system records automatically as participants vote.'}
              </p>
            </div>
          );
          const W = 560, H = 165, pL = 42, pR = 14, pT = 14, pB = 36;
          const cW = W - pL - pR, cH = H - pT - pB;
          const toX = i => pL + (i / (hist.length - 1)) * cW;
          const toY = v => (pT + cH) - (Math.min(100, Math.max(0, v)) / 100) * cH;
          const pts = hist.map((pt, i) => ({ x: toX(i), y: toY(pt.v), val: pt.v, time: pt.t, n: pt.n || 0 }));
          const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
          const areaPath = `${linePath} L ${pts[pts.length-1].x.toFixed(1)} ${pT + cH} L ${pL} ${pT + cH} Z`;
          const gradId = `polGrad_${activeSessionCode}`;
          // X-axis time labels: first, middle, last
          const timeLabels = [0, Math.floor((hist.length - 1) / 2), hist.length - 1].map(idx => ({
            x: toX(idx),
            label: new Date(hist[idx].t).toLocaleTimeString(lang === 'tr' ? 'tr-TR' : 'en-US', { hour: '2-digit', minute: '2-digit' })
          }));

          return (
            <div style={{ position: 'relative', background: 'rgba(0,0,0,0.15)', borderRadius: '10px', padding: '0.5rem 0.25rem 0.25rem' }}>
              {hoveredPtAdmin && (
                <div style={{
                  position: 'absolute',
                  left: `${Math.min(hoveredPtAdmin.x / W * 100, 78)}%`,
                  top: '8px',
                  background: 'rgba(15,10,28,0.97)',
                  border: '1px solid var(--border-glow-active)',
                  borderRadius: '8px',
                  padding: '0.45rem 0.8rem',
                  zIndex: 20,
                  pointerEvents: 'none',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                  fontSize: '0.78rem',
                  minWidth: '130px'
                }}>
                  <div style={{ fontWeight: 700, color: 'var(--color-secondary)', fontSize: '1rem' }}>%{hoveredPtAdmin.val.toFixed(1)}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                    {new Date(hoveredPtAdmin.time).toLocaleTimeString(lang === 'tr' ? 'tr-TR' : 'en-US')}
                  </div>
                  {hoveredPtAdmin.n > 0 && (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: '0.15rem' }}>
                      {hoveredPtAdmin.n} {lang === 'tr' ? 'katılımcı' : 'participants'}
                    </div>
                  )}
                  {hoveredPtAdmin.isSimulated && (
                    <div style={{ color: '#f59e0b', fontSize: '0.7rem', fontWeight: 700, marginTop: '0.15rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                      🤖 {lang === 'tr' ? 'Simülasyon Kaydı' : 'Simulated Entry'}
                    </div>
                  )}
                </div>
              )}
              <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                {/* Grid lines & Y labels */}
                {[0, 25, 50, 75, 100].map(level => {
                  const y = toY(level);
                  return (
                    <g key={level}>
                      <line x1={pL} y1={y} x2={W - pR} y2={y} stroke="rgba(255,255,255,0.07)" strokeWidth={level === 0 || level === 100 ? 1 : 0.7} strokeDasharray={level > 0 && level < 100 ? '4,4' : undefined} />
                      <text x={pL - 7} y={y + 3.5} textAnchor="end" fontSize="9" fill="#64748b">%{level}</text>
                    </g>
                  );
                })}
                {/* Area fill */}
                <path d={areaPath} fill={`url(#${gradId})`} />
                {/* Line */}
                <path d={linePath} fill="none" stroke="#818cf8" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                {/* Data points */}
                {pts.map((pt, i) => {
                  const isSim = hist[i]?.isSimulated;
                  const isHovered = hoveredPtAdmin && hoveredPtAdmin.time === pt.time;
                  return (
                    <circle
                      key={i}
                      cx={pt.x} cy={pt.y}
                      r={isHovered ? 6 : 3.5}
                      fill={isHovered ? (isSim ? '#fbbf24' : '#a5b4fc') : (isSim ? 'none' : '#6366f1')}
                      stroke={isSim ? '#f59e0b' : 'rgba(15,10,28,0.8)'}
                      strokeWidth={isSim ? 2 : 1.5}
                      strokeDasharray={isSim ? '2,1' : undefined}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setHoveredPtAdmin({ ...pt, isSimulated: isSim })}
                      onMouseLeave={() => setHoveredPtAdmin(null)}
                    />
                  );
                })}
                {/* X-axis time labels */}
                {timeLabels.map((tl, i) => (
                  <text key={i} x={tl.x} y={H - 4} textAnchor="middle" fontSize="9" fill="#64748b">{tl.label}</text>
                ))}
                {/* X-axis baseline */}
                <line x1={pL} y1={pT + cH} x2={W - pR} y2={pT + cH} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
              </svg>
              <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', marginTop: '0.25rem', fontSize: '0.78rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                <span>▶ {lang === 'tr' ? 'Başlangıç' : 'Start'}: <strong style={{ color: 'var(--text-main)' }}>%{hist[0].v.toFixed(1)}</strong></span>
                <span>■ {lang === 'tr' ? 'Güncel' : 'Current'}: <strong style={{ color: '#818cf8' }}>%{hist[hist.length-1].v.toFixed(1)}</strong></span>
                <span>{hist.length} {lang === 'tr' ? 'veri noktası' : 'data points'}</span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Azınlık Görüşleri Paneli (Minority Opinion Shield) */}
      {(() => {
        const minorityInsights = analysis?.minorityInsights || [];
        return (
          <div className="glass-panel" style={{ width: '100%', marginTop: '0.85rem' }}>
            <h2 style={{ fontSize: '1.2rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f59e0b' }}>
              <Shield size={18} style={{ color: '#f59e0b' }} />
              {lang === 'tr' ? 'Az Duyulan Ama Güçlü Argümanlar' : 'Underrepresented Strong Arguments'}
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '0.65rem' }}>
              {lang === 'tr' 
                ? 'Gerekçe kalitesi yüksek ancak henüz geniş kitlelerce oylanmamış veya azınlıkta kalan değerli fikirler.' 
                : 'High quality reasoning opinions that are underrepresented or have received fewer votes.'}
            </p>
            
            {minorityInsights.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {minorityInsights.map((insight, idx) => (
                  <div key={insight.id || idx} style={{
                    background: 'rgba(245, 158, 11, 0.06)',
                    border: '1px solid rgba(245, 158, 11, 0.25)',
                    borderLeft: '4px solid #f59e0b',
                    borderRadius: '8px',
                    padding: '0.75rem 0.9rem'
                  }}>
                    <div style={{ fontSize: '0.88rem', lineHeight: 1.45, marginBottom: '0.4rem', color: 'var(--text-main)' }}>
                      "{insight.text}"
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                      <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: 600 }}>
                        🧠 {lang === 'tr' ? 'Gerekçe Kalitesi' : 'Quality'}: %{insight.qualityScore}
                      </span>
                      <span>🗳️ {insight.voteCount} {lang === 'tr' ? 'Oy' : 'Votes'}</span>
                      <span>👍 %{insight.approvalRate ?? Math.round((insight.agreeCount / Math.max(1, insight.voteCount))*100)} {lang === 'tr' ? 'Onay' : 'Approval'}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '0.85rem', border: '1px dashed rgba(245, 158, 11, 0.25)', borderRadius: '8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                💡 {lang === 'tr' 
                  ? 'Henüz azınlık görüşü tespiti için yeterli oylama/gerekçe verisi yok (katılımcılar gerekçeli görüş ekledikçe otomatik tespit edilir).' 
                  : 'No underrepresented strong arguments detected yet.'}
              </div>
            )}
          </div>
        );
      })()}

      {/* Yöneticilerin Son Değişiklikleri Günlüğü */}
      <div className="glass-panel" style={{ width: '100%', marginTop: '1rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          📋 {t('adminChangesLogTitle', lang)}
        </h2>
        {actionLogs && actionLogs.length > 0 ? (
          <div style={{ overflowX: 'auto', maxHeight: '250px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--color-primary)' }}>
                  <th style={{ padding: '0.5rem' }}>{t('colTime', lang)}</th>
                  <th style={{ padding: '0.5rem' }}>{t('colSession', lang)}</th>
                  <th style={{ padding: '0.5rem' }}>{t('colUser', lang)}</th>
                  <th style={{ padding: '0.5rem' }}>{t('colAction', lang)}</th>
                  <th style={{ padding: '0.5rem' }}>{t('colDetails', lang)}</th>
                </tr>
              </thead>
              <tbody>
                {actionLogs.map((log, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-light)', opacity: 0.9 }}>
                    <td style={{ padding: '0.5rem', whiteSpace: 'nowrap' }}>{new Date(log.timestamp).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')}</td>
                    <td style={{ padding: '0.5rem', fontWeight: 'bold' }}>{log.code}</td>
                    <td style={{ padding: '0.5rem' }}>{log.adminName}</td>
                    <td style={{ padding: '0.5rem' }}>
                      <span className={`badge badge-secondary`} style={{ background: 'var(--color-primary-glow)', color: 'var(--color-primary)', border: '1px solid var(--border-light)' }}>{log.action}</span>
                    </td>
                    <td style={{ padding: '0.5rem', fontStyle: 'italic' }}>{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ fontStyle: 'italic', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {t('adminChangesLogEmpty', lang)}
          </p>
        )}
      </div>

      <div className="admin-layout">
      {/* Sol Panel: Oturum, AI Keşif, Kümeleme ve Simülasyon Ayarları */}
      <div className="admin-left-col" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
        {/* Masa Durumu Kontrolü */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Settings size={18} className="text-secondary" />
            {t('adminStatusTitle', lang)}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {t('adminStatusDesc', lang)}
          </p>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button 
              onClick={() => onUpdateSessionStatus('active')} 
              className="btn btn-agree"
              style={{ flex: 1, opacity: status === 'active' ? 1 : 0.4 }}
            >
              {t('adminStatusPlay', lang)}
            </button>
            <button 
              onClick={() => onUpdateSessionStatus('paused')} 
              className="btn btn-disagree"
              style={{ flex: 1, opacity: status === 'paused' ? 1 : 0.4 }}
            >
              ⏸️ {t('adminStatusPause', lang)}
            </button>
          </div>
        </div>

        {/* AI Uzlaşı Potansiyeli Keşif Paneli */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles size={18} className="text-secondary" />
            {lang === 'tr' ? 'Uzlaşı Potansiyeli Keşif Paneli' : 'Consensus Potential Discovery'}
          </h2>
          {quotaWarning && (
            <div style={{ 
              background: 'rgba(245, 158, 11, 0.12)', 
              border: '1px solid rgba(245, 158, 11, 0.35)', 
              padding: '0.65rem 0.85rem', 
              borderRadius: 'var(--radius-md)', 
              color: '#f59e0b', 
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontWeight: 600
            }}>
              <span>⚠️</span>
              <span>{lang === 'tr' ? 'Günlük API kotası dolmuş olabilir, kural tabanlı analiz aktif.' : 'Daily API quota limit may be reached, rule-based analysis is active.'}</span>
            </div>
          )}
          
          {consensusResult && (
            <div style={{ 
              background: 'rgba(29, 78, 216, 0.05)', 
              border: '1px solid var(--border-light)', 
              padding: '1rem', 
              borderRadius: 'var(--radius-md)', 
              fontSize: '0.9rem',
              lineHeight: '1.5'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#3b82f6', fontWeight: 'bold', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                <Sparkles size={14} />
                <span>AI Tahmini</span>
              </div>
              <p style={{ color: 'var(--text-main)', margin: 0 }}>{consensusResult}</p>
            </div>
          )}
          
          {consensusError && (
            <div style={{ 
              background: 'rgba(239, 68, 68, 0.1)', 
              border: '1px solid rgba(239, 68, 68, 0.2)', 
              padding: '0.75rem', 
              borderRadius: 'var(--radius-md)', 
              color: '#f87171', 
              fontSize: '0.85rem' 
            }}>
              {consensusError}
            </div>
          )}
          
          {/* Data Freshness Indicator (Requirement 4) */}
          {dataFreshness && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', marginBottom: '0.25rem' }}>
              {dataFreshness.isFresh ? (
                <span style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.25)', padding: '0.25rem 0.65rem', borderRadius: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span>🟢</span>
                  <span>{lang === 'tr' ? 'Veri Güncel (Önbellekten — 0 Token)' : 'Data Up to Date (Cached — 0 Tokens)'}</span>
                </span>
              ) : (
                <span style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.25)', padding: '0.25rem 0.65rem', borderRadius: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span>🟠</span>
                  <span>{lang === 'tr' ? 'Yeni veri mevcut — Analiz güncellenebilir' : 'New activity present — Analysis can be updated'}</span>
                </span>
              )}
            </div>
          )}

          <button 
            onClick={handleDiscoverConsensus} 
            className="btn btn-secondary"
            disabled={discoveringConsensus}
            style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', borderColor: 'var(--color-secondary)', color: 'var(--color-secondary)' }}
          >
            {discoveringConsensus ? (
              <span>{lang === 'tr' ? 'Analiz ediliyor...' : 'Analyzing...'}</span>
            ) : (
              <>
                <Sparkles size={16} />
                <span>{lang === 'tr' ? 'Uzlaşı Potansiyellerini Keşfet' : 'Discover Consensus Potentials'}</span>
              </>
            )}
          </button>
        </div>

        {/* Fikir Kümeleme ve Kamp Ayarları (Tallest Card) */}
        <div className="glass-panel">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Settings size={18} className="text-secondary" />
            {lang === 'tr' ? 'Fikir Kümeleme ve Kamp Ayarları' : 'Opinion Clustering & Camp Settings'}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
            {lang === 'tr' 
              ? 'K-Means algoritması için hedef grup sayısını belirleyin ve grupları isimlendirin.' 
              : 'Configure the target cluster size for K-Means and customize group names.'}
          </p>

          {/* Kamp Sayısı Seçici */}
          <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              {lang === 'tr' ? 'Hedef Kamp Sayısı (K Değeri):' : 'Target Camp Count (K Value):'}
            </label>
            <select
              className="form-input"
              value={targetK}
              onChange={(e) => onUpdateCampsCount(parseInt(e.target.value, 10))}
              style={{ background: 'var(--bg-card)', color: 'var(--text-main)', fontSize: '0.85rem', padding: '0.5rem' }}
            >
              <option value="2">2 {lang === 'tr' ? 'Fikir Grubu' : 'Opinion Clusters'}</option>
              <option value="3">3 {lang === 'tr' ? 'Fikir Grubu (Varsayılan)' : 'Opinion Clusters (Default)'}</option>
              <option value="4">4 {lang === 'tr' ? 'Fikir Grubu' : 'Opinion Clusters'}</option>
              <option value="5">5 {lang === 'tr' ? 'Fikir Grubu' : 'Opinion Clusters'}</option>
            </select>
          </div>

          {/* Kampları Yeniden Adlandırma Listesi */}
          <div>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>
              {lang === 'tr' ? 'Kampları Yeniden Adlandır:' : 'Rename Active Camps:'}
            </label>
            
            {camps.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {camps.map((camp) => {
                  const isEditing = editingCampId === camp.id;
                  const campLetter = String.fromCharCode(65 + camp.id);
                  return (
                    <div key={camp.id} style={{ 
                      background: 'rgba(0,0,0,0.2)', 
                      border: '1px solid var(--border-light)', 
                      borderRadius: 'var(--radius-md)', 
                      padding: '0.6rem 0.85rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem'
                    }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-primary)' }}>
                        {lang === 'tr' ? `Grup ${campLetter}` : `Cluster ${campLetter}`} ({camp.size} {lang === 'tr' ? 'kişi' : 'people'})
                      </div>

                      {isEditing ? (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <input
                            type="text"
                            className="form-input"
                            value={editingCampName}
                            onChange={(e) => setEditingCampName(e.target.value)}
                            style={{ flex: 1, padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
                            placeholder={lang === 'tr' ? 'Yeni grup ismi...' : 'New cluster name...'}
                            maxLength={40}
                          />
                          <button 
                            onClick={() => handleSaveCampName(camp.id)}
                            className="btn btn-agree"
                            style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                          >
                            {lang === 'tr' ? 'Kaydet' : 'Save'}
                          </button>
                          <button 
                            onClick={() => { setEditingCampId(null); setEditingCampName(''); }}
                            className="btn btn-pass"
                            style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            "{camp.name}"
                          </span>
                          <button 
                            onClick={() => { setEditingCampId(camp.id); setEditingCampName(camp.name); }}
                            className="btn btn-secondary"
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem', borderColor: 'var(--color-primary)', color: 'var(--color-primary)', background: 'transparent' }}
                          >
                            {lang === 'tr' ? 'Düzenle' : 'Edit'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                {lang === 'tr' ? 'Henüz aktif fikir kampı bulunmuyor.' : 'No active opinion camps found yet.'}
              </p>
            )}
          </div>
        </div>

        {/* Simülasyon Paneli */}
        <div className="glass-panel simulation-card">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={18} className="text-secondary" />
            {t('adminSimTitle', lang)}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            {t('adminSimDesc', lang)}
          </p>

          <div className="simulation-grid">
            <button onClick={() => handleRunSimulation(100)} className="btn btn-pass">
              {t('adminSimBtn', lang, { count: 100 })}
            </button>
            <button onClick={() => handleRunSimulation(200)} className="btn btn-pass">
              {t('adminSimBtn', lang, { count: 200 })}
            </button>
            <button onClick={() => handleRunSimulation(500)} className="btn btn-pass">
              {t('adminSimBtn', lang, { count: 500 })}
            </button>
          </div>

          {simStatus && (
            <div style={{
              marginTop: '1rem',
              padding: '0.75rem',
              background: 'var(--bg-main)',
              border: '1px solid var(--border-glow)',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
              color: 'var(--color-secondary)',
              fontWeight: 500
            }}>
              {simStatus}
            </div>
          )}
        </div>
      </div>

      {/* Sağ Panel: Moderasyon Kuyruğu, Soru Ayarı, Katılımcılar ve Sıfırlama */}
      <div className="admin-right-col" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
        {/* 1. TOP CARD: Görüş Moderasyon Kuyruğu */}
        <div className="glass-panel">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Shield size={18} className="text-secondary" />
            {t('adminQueueTitle', lang)} ({moderationQueue.length})
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            {t('adminQueueDesc', lang)}
          </p>

          {aiAccuracy !== undefined && (
            <div style={{
              marginBottom: '1.25rem',
              padding: '0.6rem 0.85rem',
              background: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
              color: '#93c5fd',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              🎯 <strong>{lang === 'tr' 
                ? `AI Moderasyon Doğruluğu: %${aiAccuracy} doğru alarm` 
                : `AI Moderation Accuracy: ${aiAccuracy}% true alert`}</strong>
            </div>
          )}

          <div style={{ maxHeight: '420px', overflowY: 'auto', paddingRight: '0.5rem' }}>
            {moderationQueue.length > 0 ? (
              moderationQueue.map((item) => (
                <div key={item.id} className="moderation-item">
                  <div style={{ fontSize: '1.05rem', fontWeight: 500, lineHeight: 1.4 }}>
                    "{item.text}"
                  </div>

                  {item.aiWarning && (
                    <div style={{
                      marginTop: '0.5rem',
                      padding: '0.5rem 0.75rem',
                      background: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      color: '#f87171',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem'
                    }}>
                      <span>{t('adminAiWarningLabel', lang)}</span>
                      <strong>{item.aiWarning}</strong>
                    </div>
                  )}

                  <div className="moderation-meta">
                    <span>{lang === 'tr' ? 'Yazan' : 'Author'}: <strong>{item.author}</strong></span>
                    <span>{new Date(item.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="moderation-actions">
                    <button 
                      onClick={() => onApproveStatement(item.id)} 
                      className="btn btn-agree" 
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                    >
                      {t('adminApprove', lang)}
                    </button>
                    <button 
                      onClick={() => onRejectStatement(item.id)} 
                      className="btn btn-disagree" 
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                    >
                      {t('adminReject', lang)}
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state" style={{ padding: '2rem 1rem' }}>
                <div className="empty-state-icon">🛡️</div>
                <p>{t('adminQueueEmpty', lang)}</p>
              </div>
            )}
          </div>
        </div>

        {/* 2. CARD BELOW MODERATION QUEUE: Müzakere Masası Konusu (Question Editor) */}
        <div className="glass-panel">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Settings size={18} className="text-secondary" />
            {t('adminQuestionTitle', lang)}
          </h2>
          <form onSubmit={handleUpdateQuestion} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">{t('adminQuestionFormLabel', lang)}</label>
              <textarea 
                className="form-input" 
                rows={3}
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn btn-secondary">
              {t('adminQuestionUpdateBtn', lang)}
            </button>
          </form>
        </div>

        {/* 3. Aktif Katılımcılar Listesi */}
        <div className="glass-panel">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={18} className="text-secondary" />
            {t('partModKickTitle', lang)} ({participants.length})
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            {lang === 'tr' 
              ? 'Masaya bağlı katılımcıları görüntüleyin. Sabotaj yapan veya kuralları ihlal eden kişileri masadan atabilirsiniz.' 
              : 'View connected participants. You can kick users who sabotage the deliberation or violate the rules.'}
          </p>
          
          <div className="participant-list">
            {participants.length > 0 ? (
              participants.map(p => (
                <div key={p.id} className="participant-list-item">
                  <div className="participant-list-name" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>
                    <span>{p.isBot ? '🤖' : '👤'}</span>
                    <strong>{p.nickname}</strong>
                    {p.justification && (
                      <span className="participant-list-meta" title={p.justification} style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        ({p.justification})
                      </span>
                    )}
                  </div>
                  <button 
                    onClick={() => {
                      if (confirm(t('adminKickConfirm', lang, { nick: p.nickname }))) {
                        onKickParticipant(p.id);
                      }
                    }}
                    className="btn btn-disagree"
                    style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                  >
                    {t('partBtnKick', lang)}
                  </button>
                </div>
              ))
            ) : (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '1rem 0' }}>
                {t('partModKickEmpty', lang)}
              </p>
            )}
          </div>
        </div>

        {/* 4. Sıfırlama / Tehlikeli Bölge */}
        <div className="glass-panel" style={{ border: '1px solid rgba(239, 68, 68, 0.3)' }}>
          <h2 style={{ fontSize: '1.25rem', color: 'var(--color-disagree)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={18} />
            {lang === 'tr' ? 'Tehlikeli Bölge' : 'Danger Zone'}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            {t('adminResetDesc', lang)}
          </p>

          <button 
            onClick={handleResetSession} 
            className="btn btn-disagree" 
            style={{ width: '100%' }}
          >
            {resetConfirm ? t('adminResetBtnConfirm', lang) : t('adminResetBtn', lang)}
          </button>
          {resetConfirm && (
            <button 
              onClick={() => setResetConfirm(false)} 
              className="btn btn-pass" 
              style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.85rem' }}
            >
              {lang === 'tr' ? 'Vazgeç' : 'Cancel'}
            </button>
          )}
        </div>
      </div>
    </div>
  </div>
  );
}
