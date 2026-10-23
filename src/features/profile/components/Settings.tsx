import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, type IconType } from '@/components/ui/Icon';
import { APP_CONFIG } from '@/config/constants';
import { account } from '@/services/appwrite';
import { databaseService } from '@/services/database';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/context/ToastContext';
import { authErrorMessage } from '@/utils/authErrors';
import type { AuthenticatedUser } from '@/types/types';
import { initialsAvatar } from '@/utils/avatar';
import { useBlocks } from '@/context/BlocksContext';
import { displayNameOf } from '@/utils/profile';
import { PasswordMeter } from '@/components/form/PasswordMeter';
import { email as emailRule, passwordStrength } from '@/utils/validation';
import { NotificationsTab } from './NotificationSettings';

interface SettingsProps {
  currentUser: AuthenticatedUser;
  onNavigate: (view: string, id?: string) => void;
  onLogout?: () => void;
}

type Tab = 'account' | 'notifications' | 'security' | 'privacy' | 'about';

const MENU: { id: Tab; label: string; icon: IconType }[] = [
  { id: 'account', label: 'Account', icon: 'user' },
  { id: 'notifications', label: 'Notifiche', icon: 'bell' },
  { id: 'security', label: 'Password e accesso', icon: 'lock-closed' },
  { id: 'privacy', label: 'Privacy e dati', icon: 'shield' },
  { id: 'about', label: 'Info e legale', icon: 'info' },
];

const inputClass =
  'w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-slate-50 focus:bg-white';

const Card: React.FC<{ title: string; description?: string; children: React.ReactNode; tone?: 'default' | 'danger' }> = ({ title, description, children, tone = 'default' }) => (
  <section className={`rounded-2xl border p-5 ${tone === 'danger' ? 'border-red-200 bg-red-50/50' : 'border-slate-200 bg-white'}`}>
    <h3 className={`font-bold ${tone === 'danger' ? 'text-red-700' : 'text-slate-900'}`}>{title}</h3>
    {description && <p className="text-sm text-slate-500 mt-1 mb-4">{description}</p>}
    {!description && <div className="mb-3" />}
    {children}
  </section>
);

export const Settings: React.FC<SettingsProps> = ({ currentUser, onLogout }) => {
  // Si può aprire direttamente una sezione: /profile?tab=impostazioni&sezione=notifiche (link nelle email).
  const [activeTab, setActiveTab] = useState<Tab>(() => (new URLSearchParams(window.location.search).get('sezione') === 'notifiche' ? 'notifications' : 'account'));
  const isProfessional = currentUser.userType === 'professional';

  const displayName = isProfessional
    ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() || 'Utente'
    : currentUser.structureName || 'Struttura';
  const displayAvatar = (isProfessional ? currentUser.avatar : currentUser.logo) ||
    initialsAvatar(displayName);

  return (
    <div className="max-w-5xl mx-auto w-full animate-in fade-in duration-300">
      <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800 flex items-center gap-3 mb-6">
        <Icon type="settings" className="w-8 h-8 text-slate-400" />
        Impostazioni
      </h1>

      <div className="flex flex-col md:flex-row gap-6">
        <div className="w-full md:w-64 flex-shrink-0">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden md:sticky md:top-24">
            <div className="p-5 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
              <img src={displayAvatar} alt="" className="w-12 h-12 rounded-full object-cover border border-slate-200 bg-white" />
              <div className="min-w-0">
                <p className="font-bold text-slate-800 truncate">{displayName}</p>
                <p className="text-xs text-slate-500 font-medium truncate">{currentUser.email}</p>
              </div>
            </div>
            <nav className="p-2 flex md:flex-col gap-1 overflow-x-auto" aria-label="Sezioni impostazioni">
              {MENU.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  aria-current={activeTab === item.id ? 'page' : undefined}
                  className={`flex-shrink-0 md:w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-semibold text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    activeTab === item.id ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Icon type={item.icon} className={`w-5 h-5 ${activeTab === item.id ? 'text-blue-600' : 'text-slate-400'}`} />
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
        </div>

        <div className="flex-1 space-y-4 min-w-0">
          {activeTab === 'account' && <AccountTab user={currentUser} />}
          {activeTab === 'notifications' && <NotificationsTab />}
          {activeTab === 'security' && <SecurityTab user={currentUser} />}
          {activeTab === 'privacy' && <PrivacyTab user={currentUser} />}
          {activeTab === 'about' && <AboutTab onLogout={onLogout} />}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------

const AccountTab: React.FC<{ user: AuthenticatedUser }> = ({ user }) => {
  const { showToast } = useToast();
  const [isSending, setIsSending] = useState(false);
  const verified = !!user.emailVerification;

  const resendVerification = async () => {
    setIsSending(true);
    try {
      await account.createVerification(`${window.location.origin}/verifica-email`);
      showToast(`Ti abbiamo inviato un link a ${user.email}.`, 'success');
    } catch (error) {
      showToast(authErrorMessage(error, 'Invio non riuscito. Riprova più tardi.'), 'error');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <Card title="Informazioni dell'account">
        <dl className="divide-y divide-slate-100 text-sm">
          <div className="flex justify-between gap-4 py-2.5">
            <dt className="text-slate-500">Email</dt>
            <dd className="font-semibold text-slate-800 truncate">{user.email}</dd>
          </div>
          <div className="flex justify-between gap-4 py-2.5">
            <dt className="text-slate-500">Tipo di account</dt>
            <dd className="font-semibold text-slate-800">{user.userType === 'professional' ? 'Professionista' : 'Struttura'}</dd>
          </div>
          <div className="flex justify-between gap-4 py-2.5">
            <dt className="text-slate-500">Iscritto dal</dt>
            <dd className="font-semibold text-slate-800">{new Date(user.registration || user.$createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</dd>
          </div>
        </dl>
      </Card>

      <Card
        title="Verifica dell'email"
        description={verified ? 'Il tuo indirizzo email è verificato.' : 'Verifica la tua email per proteggere l\'account e recuperarlo se dimentichi la password.'}
      >
        {verified ? (
          <span className="inline-flex items-center gap-2 text-sm font-bold text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-full">
            <Icon type="check-circle" className="w-4 h-4" /> Verificata
          </span>
        ) : (
          <button onClick={resendVerification} disabled={isSending} className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-60">
            {isSending ? 'Invio…' : 'Invia link di verifica'}
          </button>
        )}
      </Card>

      <DeleteAccountCard />
    </>
  );
};

const SecurityTab: React.FC<{ user: AuthenticatedUser }> = ({ user }) => {
  const { showToast } = useToast();
  const { refreshProfile } = useAuth();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [busy, setBusy] = useState<'password' | 'email' | 'sessions' | null>(null);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const strength = passwordStrength(newPassword, [user.email.split('@')[0]]);
    if (strength.score < 1) return showToast(strength.hint || 'Scegli una password più robusta.', 'error');
    if (newPassword === oldPassword) return showToast('La nuova password deve essere diversa da quella attuale.', 'error');
    if (newPassword !== confirm) return showToast('Le due password non coincidono.', 'error');
    setBusy('password');
    try {
      await account.updatePassword(newPassword, oldPassword);
      setOldPassword(''); setNewPassword(''); setConfirm('');
      showToast('Password aggiornata.', 'success');
    } catch (error) {
      showToast(authErrorMessage(error, 'Password attuale non corretta.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const changeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const next = newEmail.trim().toLowerCase();
    if (emailRule(next)) return showToast('Indirizzo email non valido.', 'error');
    if (next === user.email.toLowerCase()) return showToast('È già la tua email attuale.', 'info');
    setBusy('email');
    try {
      await account.updateEmail(next, emailPassword);
      await databaseService.updateProfile(user.$id, { email: next });
      await account.createVerification(`${window.location.origin}/verifica-email`).catch(() => undefined);
      await refreshProfile();
      setNewEmail(''); setEmailPassword('');
      showToast('Email aggiornata. Ti abbiamo inviato un link per verificarla.', 'success');
    } catch (error) {
      showToast(authErrorMessage(error, 'Aggiornamento non riuscito.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const logoutOtherDevices = async () => {
    setBusy('sessions');
    try {
      const { sessions } = await account.listSessions();
      await Promise.all(sessions.filter((s) => !s.current).map((s) => account.deleteSession(s.$id)));
      showToast('Disconnesso da tutti gli altri dispositivi.', 'success');
    } catch (error) {
      showToast(authErrorMessage(error, 'Operazione non riuscita.'), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Card title="Cambia password">
        <form onSubmit={changePassword} className="space-y-3 max-w-sm">
          <input type="password" autoComplete="current-password" placeholder="Password attuale" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} className={inputClass} required aria-label="Password attuale" />
          <div>
            <input type="password" autoComplete="new-password" placeholder="Nuova password (almeno 8 caratteri)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputClass} minLength={8} required aria-label="Nuova password" aria-describedby="new-password-strength" />
            <PasswordMeter id="new-password-strength" password={newPassword} personal={[user.email.split('@')[0]]} />
          </div>
          <div>
            <input type="password" autoComplete="new-password" placeholder="Ripeti la nuova password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} required aria-label="Ripeti la nuova password" aria-invalid={confirm && confirm !== newPassword ? 'true' : undefined} />
            {confirm && confirm !== newPassword && <p className="text-xs text-galleggiante mt-1.5">Le due password non coincidono.</p>}
          </div>
          <button type="submit" disabled={busy !== null} className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-60">
            {busy === 'password' ? 'Salvataggio…' : 'Aggiorna password'}
          </button>
        </form>
      </Card>

      <Card title="Cambia email" description={`Attuale: ${user.email}. Per sicurezza ti chiediamo la password.`}>
        <form onSubmit={changeEmail} className="space-y-3 max-w-sm">
          <input type="email" autoComplete="email" placeholder="Nuova email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className={inputClass} required aria-label="Nuova email" />
          <input type="password" autoComplete="current-password" placeholder="Password" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} className={inputClass} required aria-label="Password" />
          <button type="submit" disabled={busy !== null} className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-60">
            {busy === 'email' ? 'Salvataggio…' : 'Aggiorna email'}
          </button>
        </form>
      </Card>

      <Card title="Dispositivi" description="Se hai effettuato l'accesso su un dispositivo che non usi più, puoi disconnetterlo.">
        <button onClick={logoutOtherDevices} disabled={busy !== null} className="px-4 py-2 text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl disabled:opacity-60">
          {busy === 'sessions' ? 'Disconnessione…' : 'Esci da tutti gli altri dispositivi'}
        </button>
      </Card>
    </>
  );
};

const PrivacyTab: React.FC<{ user: AuthenticatedUser }> = ({ user }) => {
  const { showToast } = useToast();
  const { updateProfile } = useAuth();
  const [readReceipts, setReadReceipts] = useState(user.readReceipts !== false);
  const [isExporting, setIsExporting] = useState(false);

  const toggleReadReceipts = async () => {
    const next = !readReceipts;
    setReadReceipts(next);
    try {
      await updateProfile({ readReceipts: next });
    } catch {
      setReadReceipts(!next);
      showToast('Impostazione non salvata.', 'error');
    }
  };

  const exportData = async () => {
    setIsExporting(true);
    try {
      const data = await databaseService.exportMyData(user.$id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `swimin-dati-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('exportMyData:', error);
      showToast('Esportazione non riuscita.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <Card title="Conferme di lettura" description="Se attive, chi ti scrive vede quando hai letto i suoi messaggi (spunte blu).">
        <button
          role="switch"
          aria-checked={readReceipts}
          onClick={toggleReadReceipts}
          className={`relative inline-flex h-7 w-12 rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${readReceipts ? 'bg-blue-600' : 'bg-slate-300'}`}
        >
          <span className="sr-only">Conferme di lettura</span>
          <span className={`inline-block h-6 w-6 mt-0.5 rounded-full bg-white shadow transform transition ${readReceipts ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </Card>

      <BlockedPeopleCard />

      <Card title="Scarica i tuoi dati" description="Un file con il tuo profilo, i tuoi post, commenti, candidature e collegamenti (diritto alla portabilità, art. 20 GDPR).">
        <button onClick={exportData} disabled={isExporting} className="px-4 py-2 text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl disabled:opacity-60 inline-flex items-center gap-2">
          <Icon type="document" className="w-4 h-4" /> {isExporting ? 'Preparazione…' : 'Scarica (JSON)'}
        </button>
      </Card>

      <Card title="Come trattiamo i tuoi dati">
        <p className="text-sm text-slate-600">
          Leggi la <Link to="/privacy" className="text-blue-600 font-semibold hover:underline">Privacy Policy</Link> e la{' '}
          <Link to="/cookie" className="text-blue-600 font-semibold hover:underline">Cookie Policy</Link>.
        </p>
      </Card>
    </>
  );
};

/** Persone bloccate o silenziate, con la possibilità di annullare. */
const BlockedPeopleCard: React.FC = () => {
  const { blocked, muted, unblock } = useBlocks();
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const ids = [...new Set([...blocked, ...muted])];
  const key = ids.join(',');

  React.useEffect(() => {
    if (!ids.length) return;
    databaseService
      .getConnectionsProfiles(ids)
      .then((list) => setProfiles(Object.fromEntries(list.map((p) => [p.userId || p.$id, displayNameOf(p)]))))
      .catch((e) => console.warn('Profili non disponibili:', e));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = [...blocked.map((id) => ({ id, kind: 'block' as const })), ...muted.map((id) => ({ id, kind: 'mute' as const }))];
  return (
    <Card title="Persone bloccate e silenziate" description="Le persone bloccate non possono contattarti né vedere i tuoi contenuti; quelle silenziate restano collegate ma non compaiono nel tuo feed.">
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">Nessuno.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((r) => (
            <li key={`${r.kind}-${r.id}`} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0">
                <Link to={`/profile/${r.id}`} className="font-semibold text-slate-800 hover:underline truncate">{profiles[r.id] || 'Utente'}</Link>
                <span className="block text-xs text-slate-500">{r.kind === 'block' ? 'Bloccato' : 'Silenziato'}</span>
              </span>
              <button onClick={() => unblock(r.id, r.kind)} className="px-3 py-1.5 text-sm font-semibold text-corsia-700 bg-corsia-50 hover:bg-corsia-100 rounded-full">
                {r.kind === 'block' ? 'Sblocca' : 'Riattiva'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

const AboutTab: React.FC<{ onLogout?: () => void }> = ({ onLogout }) => (
  <>
    <Card title="SwimIn" description={`Il network professionale del nuoto · versione ${APP_CONFIG.version}`}>
      <div className="space-y-2">
        {[
          { to: '/termini', label: 'Termini di servizio' },
          { to: '/privacy', label: 'Privacy Policy' },
          { to: '/cookie', label: 'Cookie Policy' },
        ].map((item) => (
          <Link key={item.to} to={item.to} className="w-full flex items-center justify-between p-3.5 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors font-semibold text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            {item.label}
            <Icon type="chevron-right" className="w-4 h-4 text-slate-400" />
          </Link>
        ))}
      </div>
    </Card>
    {onLogout && (
      <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 p-4 bg-white border border-slate-200 text-red-600 font-bold rounded-2xl hover:bg-red-50 transition outline-none focus-visible:ring-2 focus-visible:ring-red-500">
        <Icon type="logout" className="w-5 h-5" /> Esci dall'account
      </button>
    )}
  </>
);

const CONFIRM_WORD = 'ELIMINA';

const DeleteAccountCard: React.FC = () => {
  const { showToast } = useToast();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const confirmDelete = async () => {
    setIsDeleting(true);
    try {
      await databaseService.deleteAccount(typed);
      showToast('Il tuo account è stato eliminato. Ci mancherai!', 'info');
      await logout().catch(() => undefined); // la sessione è già invalidata dalla cancellazione
      navigate('/login', { replace: true });
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Eliminazione non riuscita.', 'error');
      setIsDeleting(false);
    }
  };

  return (
    <Card tone="danger" title="Elimina account" description="Elimina definitivamente il profilo, i post, i commenti, le candidature e i collegamenti. L'operazione non è reversibile.">
      {!isOpen ? (
        <button onClick={() => setIsOpen(true)} className="px-4 py-2 text-sm font-bold text-red-600 bg-white border border-red-200 hover:bg-red-600 hover:text-white rounded-xl transition">
          Elimina il mio account
        </button>
      ) : (
        <div className="space-y-3 max-w-sm">
          <label htmlFor="confirm-delete" className="block text-sm text-slate-700">
            Per confermare scrivi <strong>{CONFIRM_WORD}</strong>
          </label>
          <input id="confirm-delete" value={typed} onChange={(e) => setTyped(e.target.value)} className={inputClass} autoComplete="off" disabled={isDeleting} />
          <div className="flex gap-2">
            <button onClick={() => { setIsOpen(false); setTyped(''); }} disabled={isDeleting} className="px-4 py-2 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl">
              Annulla
            </button>
            <button onClick={confirmDelete} disabled={typed !== CONFIRM_WORD || isDeleting} className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-50">
              {isDeleting ? 'Eliminazione…' : 'Elimina definitivamente'}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
};
