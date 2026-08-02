import React, { useState } from 'react';
import { HelpCircle, User, MessageSquareCode, Award, Lock, ShieldAlert, PlusCircle, LogIn } from 'lucide-react';
import { t } from '../i18n';

export default function Lobby({ question, onJoin, participantsCount, lang = 'tr' }) {
  const [activeTab, setActiveTab] = useState('join'); // 'join' veya 'create'
  const [nickname, setNickname] = useState('');
  const [justification, setJustification] = useState('');
  const [sessionCode, setSessionCode] = useState('');
  const [joinVisibility, setJoinVisibility] = useState('PUBLIC');
  const [sessionPassword, setSessionPassword] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Oturum oluşturma state'leri
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newQuestion, setNewQuestion] = useState('');
  const [creatorNickname, setCreatorNickname] = useState('');

  // Giriş Yapma İşlemi
  const handleJoinSubmit = async (e) => {
    e.preventDefault();
    if (!nickname.trim()) return setError(lang === 'tr' ? 'Lütfen bir rumuz girin.' : 'Please enter a nickname.');
    if (!sessionCode.trim()) return setError(lang === 'tr' ? 'Lütfen oturum kodunu girin.' : 'Please enter a table code.');
    setError('');
    const upperCode = sessionCode.trim().toUpperCase();

    try {
      // 1. Şifre gerekliliğini / oturum durumunu test et
      const res = await fetch(`/api/sessions/${upperCode}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: joinVisibility === 'PASSWORD_PROTECTED' ? sessionPassword : '' })
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.passwordRequired) {
          return setError(lang === 'tr' ? 'Bu masaya erişmek için geçerli bir şifre girmelisiniz.' : 'You must enter a valid password to access this table.');
        }
        return setError(data.message || (lang === 'tr' ? 'Giriş yapılamadı.' : 'Failed to join.'));
      }

      // Giriş başarılıysa accessToken'ı kaydet
      if (data.accessToken) {
        localStorage.setItem(`session_token_${upperCode}`, data.accessToken);
      }

      // App.jsx üzerindeki onJoin handler'ını çağır
      onJoin({
        sessionCode: upperCode,
        nickname: nickname.trim(),
        justification: '',
        token: data.accessToken
      });
    } catch (err) {
      setError(lang === 'tr' ? 'Sunucu bağlantısı sırasında bir hata oluştu.' : 'An error occurred while connecting to the server.');
    }
  };

  // Yeni Masa Oluşturma İşlemi
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return setError(lang === 'tr' ? 'Masa başlığı gereklidir.' : 'Table title is required.');
    if (!newQuestion.trim()) return setError(lang === 'tr' ? 'Müzakere sorusu gereklidir.' : 'Core question is required.');
    if (!creatorNickname.trim()) return setError(lang === 'tr' ? 'Moderatör rumuzu gereklidir.' : 'Moderator nickname is required.');

    setError('');
    try {
      const res = await fetch('/api/sessions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDesc.trim(),
          question: newQuestion.trim(),
          nickname: creatorNickname.trim()
        })
      });
      const data = await res.json();

      if (!res.ok) {
        return setError(data.message || (lang === 'tr' ? 'Masa oluşturulamadı.' : 'Failed to create table.'));
      }

      // Moderatör token'ı ve oturum kodunu kaydet
      localStorage.setItem(`moderator_token_${data.code}`, data.moderatorToken);
      if (data.token) {
        // Eğer katılımcı tokenı da varsa
        localStorage.setItem(`session_token_${data.code}`, data.token);
      }

      setSuccessMsg(lang === 'tr' ? `Masa '${data.code}' başarıyla oluşturuldu! Şifre: ${data.password}. Yönlendiriliyorsunuz...` : `Table '${data.code}' created successfully! Password: ${data.password}. Redirecting...`);
      
      setTimeout(() => {
        onJoin({
          sessionCode: data.code,
          nickname: creatorNickname.trim(),
          justification: lang === 'tr' ? 'Kurucu Moderatör' : 'Founding Moderator',
          isModerator: true,
          token: data.moderatorToken
        });
      }, 6000);

    } catch (err) {
      setError(lang === 'tr' ? 'Masa oluşturulurken bir hata oluştu.' : 'An error occurred while creating the table.');
    }
  };

  return (
    <div className="lobby-layout" style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      {/* Welcome Heading Block */}
      <div style={{ textAlign: 'center', marginBottom: '1.75rem', maxWidth: '520px' }}>
        <h1 style={{ fontSize: '1.85rem', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text-main)', marginBottom: '0.4rem' }}>
          {lang === 'tr' ? 'Müzakere Masası\'na Hoş Geldiniz' : 'Welcome to Deliberation Table'}
        </h1>
        <p style={{ fontSize: '0.92rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
          {lang === 'tr' 
            ? 'Kamusal müzakereye katılmak için bir masaya giriş yapın veya yeni bir müzakere başlatın.' 
            : 'Join an active deliberation table or create a new consultation session.'}
        </p>
      </div>

      {/* Giriş / Masa Oluşturma Sekmeleri */}
      <div className="glass-panel" style={{ height: 'fit-content', width: '100%', maxWidth: '480px', margin: '0 auto' }}>
        
        {/* Sekme Butonları */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-light)', marginBottom: '1.5rem' }}>
          <button
            onClick={() => { setActiveTab('join'); setError(''); }}
            style={{
              flex: 1,
              padding: '0.75rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'join' ? '2px solid var(--color-primary)' : '2px solid transparent',
              color: activeTab === 'join' ? 'var(--text-main)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem'
            }}
          >
            <LogIn size={16} /> {t('lobbyJoinTab', lang)}
          </button>
          <button
            onClick={() => { setActiveTab('create'); setError(''); }}
            style={{
              flex: 1,
              padding: '0.75rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'create' ? '2px solid var(--color-primary)' : '2px solid transparent',
              color: activeTab === 'create' ? 'var(--text-main)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem'
            }}
          >
            <PlusCircle size={16} /> {t('lobbyCreateTab', lang)}
          </button>
        </div>

        {error && (
          <div style={{ 
            background: 'var(--color-disagree-glow)', 
            border: '1px solid var(--color-disagree)', 
            color: 'var(--text-main)', 
            padding: '0.75rem', 
            borderRadius: 'var(--radius-md)', 
            marginBottom: '1rem',
            fontSize: '0.85rem'
          }}>
            {error}
          </div>
        )}

        {successMsg && (
          <div style={{ 
            background: 'rgba(51, 255, 87, 0.1)', 
            border: '1px solid var(--color-agree)', 
            color: 'var(--text-main)', 
            padding: '0.75rem', 
            borderRadius: 'var(--radius-md)', 
            marginBottom: '1rem',
            fontSize: '0.85rem'
          }}>
            {successMsg}
          </div>
        )}

        {/* MASAYA KATIL FORMU */}
        {activeTab === 'join' && (
          <form onSubmit={handleJoinSubmit}>
            <div className="form-group">
              <label className="form-label">{t('lobbyFormCode', lang)}</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Örn: XY12AB" 
                value={sessionCode}
                onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
                maxLength={10}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">{lang === 'tr' ? 'Masa Türü' : 'Table Type'}</label>
              <select 
                className="form-input" 
                value={joinVisibility}
                onChange={(e) => setJoinVisibility(e.target.value)}
                style={{ background: 'var(--bg-card)', color: 'var(--text-main)' }}
              >
                <option value="PUBLIC">{lang === 'tr' ? 'Herkese Açık (Şifresiz)' : 'Public (No Password)'}</option>
                <option value="PASSWORD_PROTECTED">{lang === 'tr' ? 'Şifreli (Parolalı)' : 'Private (Password Protected)'}</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">
                <User size={14} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />
                {t('lobbyFormNick', lang)}
              </label>
              <input 
                type="text" 
                className="form-input" 
                placeholder={t('lobbyFormNickPlaceholder', lang)} 
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={20}
                required
              />
            </div>

            {joinVisibility === 'PASSWORD_PROTECTED' && (
              <div className="form-group">
                <label className="form-label">
                  <Lock size={14} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />
                  {t('lobbyFormPass', lang)}
                </label>
                <input 
                  type="password" 
                  className="form-input" 
                  placeholder={t('lobbyFormPassPlaceholder', lang)} 
                  value={sessionPassword}
                  onChange={(e) => setSessionPassword(e.target.value)}
                  required
                />
              </div>
            )}

            <button type="submit" className="btn" style={{ width: '100%', marginTop: '1rem' }}>
              {t('lobbyBtnJoin', lang)}
            </button>
          </form>
        )}

        {/* YENİ MASA AÇ FORMU */}
        {activeTab === 'create' && (
          <form onSubmit={handleCreateSubmit}>
            <div className="form-group">
              <label className="form-label">{t('lobbyFormTitle', lang)}</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder={t('lobbyFormTitlePlaceholder', lang)} 
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                maxLength={50}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t('lobbyFormDesc', lang)}</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder={t('lobbyFormDescPlaceholder', lang)} 
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                maxLength={100}
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t('lobbyFormQuestion', lang)}</label>
              <textarea 
                className="form-textarea" 
                placeholder={t('lobbyFormQuestionPlaceholder', lang)} 
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                rows={3}
                maxLength={150}
                required
              ></textarea>
            </div>



            <div className="form-group">
              <label className="form-label">
                <User size={14} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} />
                {lang === 'tr' ? 'Moderatör Rumuzunuz' : 'Moderator Nickname'}
              </label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Örn: Admin_Ahmet" 
                value={creatorNickname}
                onChange={(e) => setCreatorNickname(e.target.value)}
                maxLength={20}
                required
              />
            </div>

            <button type="submit" className="btn btn-secondary" style={{ width: '100%', marginTop: '1rem', borderColor: 'var(--color-primary)' }}>
              {t('lobbyBtnCreate', lang)}
            </button>
          </form>
        )}

      </div>
    </div>
  );
}
