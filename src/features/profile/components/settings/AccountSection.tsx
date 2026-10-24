import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { account } from '@/services/appwrite';
import { databaseService, type BillingStatus } from '@/services/database';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/context/ToastContext';
import { authErrorMessage } from '@/utils/authErrors';
import { avatarOf, displayNameOf, headlineOf } from '@/utils/profile';
import { email as emailRule } from '@/utils/validation';
import { formatDate, toISODate } from '@/utils/dates';
import { isPremium } from '@/utils/premium';
import { Field, fieldClass } from '@/components/form/Field';
import { PremiumBadge } from '@/features/premium/PremiumBadge';
import type { AuthenticatedUser } from '@/types/types';
import { Badge, Group, Row, RowPanel, SectionHeader, btn } from './ui';

const accountKind = (u: AuthenticatedUser) =>
    u.userType === 'structure' ? 'Struttura' : (u as { personType?: string }).personType === 'enthusiast' ? 'Appassionato di nuoto' : 'Professionista';

const SOURCE_LABEL: Record<string, string> = { trial: 'prova gratuita', stripe: 'carta', paypal: 'PayPal', admin: 'omaggio' };

export const AccountSection: React.FC<{ user: AuthenticatedUser; onEditProfile: () => void; onLogout?: () => void }> = ({ user, onEditProfile, onLogout }) => {
    const { showToast } = useToast();
    const { refreshProfile } = useAuth();
    const verified = !!user.emailVerification;
    const [sending, setSending] = useState(false);
    const [emailOpen, setEmailOpen] = useState(false);
    const [newEmail, setNewEmail] = useState('');
    const [password, setPassword] = useState('');
    const [emailError, setEmailError] = useState<string | undefined>();
    const [savingEmail, setSavingEmail] = useState(false);

    const resendVerification = async () => {
        setSending(true);
        try {
            await account.createVerification(`${window.location.origin}/verifica-email`);
            showToast(`Ti abbiamo inviato un link a ${user.email}.`, 'success');
        } catch (err) {
            showToast(authErrorMessage(err, 'Invio non riuscito. Riprova più tardi.'), 'error');
        } finally {
            setSending(false);
        }
    };

    const changeEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        const next = newEmail.trim().toLowerCase();
        if (emailRule(next)) return setEmailError('Scrivi un indirizzo email valido, es. nome@esempio.it.');
        if (next === user.email.toLowerCase()) return setEmailError('È già la tua email attuale.');
        setEmailError(undefined);
        setSavingEmail(true);
        try {
            // L'email vive solo nell'account Appwrite: il profilo è pubblico e non la contiene.
            await account.updateEmail(next, password);
            await account.createVerification(`${window.location.origin}/verifica-email`).catch((err) => console.warn('Verifica email:', err));
            await refreshProfile();
            setEmailOpen(false);
            setNewEmail('');
            setPassword('');
            showToast(`Email aggiornata. Ti abbiamo inviato un link per verificare ${next}.`, 'success');
        } catch (err) {
            showToast(authErrorMessage(err, 'Email non aggiornata: controlla la password.'), 'error');
        } finally {
            setSavingEmail(false);
        }
    };

    const since = user.registration || user.$createdAt;

    return (
        <>
            <SectionHeader title="Account" description="I dati con cui accedi, il tuo piano e la gestione dell’account." />
            <div className="space-y-5">
                <Group title="Profilo">
                    <Row
                        title={<span className="flex items-center gap-2">{displayNameOf(user)} {isPremium(user) && <PremiumBadge />}</span>}
                        description={headlineOf(user) || accountKind(user)}
                        leading={<img src={avatarOf(user)} alt="" className="w-12 h-12 rounded-full object-cover bg-slate-100 flex-shrink-0" />}
                        aside={<button type="button" onClick={onEditProfile} className={btn.secondary}>Modifica il profilo</button>}
                    />
                    <Row title="Tipo di account" description={accountKind(user)} />
                    {since && <Row title="Iscritto dal" description={formatDate(toISODate(new Date(since)))} />}
                </Group>

                <Group title="Email" description="La usi per accedere e per ricevere avvisi. Non è visibile sul profilo.">
                    <Row
                        icon="mail"
                        title={<span className="flex flex-wrap items-center gap-2 break-all">{user.email} {verified ? <Badge tone="ok">Verificata</Badge> : <Badge tone="warn">Da verificare</Badge>}</span>}
                        description={verified ? 'Puoi recuperare l’account da qui se dimentichi la password.' : 'Verificala per poter recuperare l’account e ricevere le email di SwimIn.'}
                        aside={
                            <>
                                {!verified && <button type="button" onClick={resendVerification} disabled={sending} className={btn.primary}>{sending ? 'Invio…' : 'Invia il link'}</button>}
                                {!emailOpen && <button type="button" onClick={() => setEmailOpen(true)} className={btn.secondary}>Cambia</button>}
                            </>
                        }
                    >
                        {emailOpen && (
                            <RowPanel withIcon>
                                <form onSubmit={changeEmail} className="space-y-4 max-w-md" noValidate>
                                    <Field id="new-email" label="Nuova email" error={emailError}>
                                        <input type="email" autoComplete="email" value={newEmail} onChange={(e) => { setNewEmail(e.target.value); setEmailError(undefined); }} required />
                                    </Field>
                                    <Field id="email-password" label="Password attuale" hint="Per sicurezza, conferma che sei tu.">
                                        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={fieldClass()} required />
                                    </Field>
                                    <div className="flex flex-wrap gap-2">
                                        <button type="submit" disabled={savingEmail || !newEmail || !password} className={btn.primary}>{savingEmail ? 'Salvataggio…' : 'Salva la nuova email'}</button>
                                        <button type="button" onClick={() => { setEmailOpen(false); setNewEmail(''); setPassword(''); setEmailError(undefined); }} className={btn.quiet}>Annulla</button>
                                    </div>
                                </form>
                            </RowPanel>
                        )}
                    </Row>
                </Group>

                <PlanGroup user={user} />

                <Group title="Chiudi la sessione o l’account">
                    {onLogout && (
                        <Row icon="logout" title="Esci da SwimIn" description="Chiude la sessione su questo dispositivo." aside={<button type="button" onClick={onLogout} className={btn.secondary}>Esci</button>} />
                    )}
                    <DeleteAccountRow />
                </Group>
            </div>
        </>
    );
};

/** Piano attuale: Base o Premium, con rinnovo e gestione dell'abbonamento. */
const PlanGroup: React.FC<{ user: AuthenticatedUser }> = ({ user }) => {
    const { showToast } = useToast();
    const [status, setStatus] = useState<BillingStatus | null>(null);
    const [failed, setFailed] = useState(false);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        databaseService.getBillingStatus().then(setStatus).catch((err) => { console.warn('Stato Premium:', err); setFailed(true); });
    }, []);

    const premium = status ? status.premium : isPremium(user);
    const until = status?.premiumUntil || (user as { premiumUntil?: string | null }).premiumUntil || null;
    const sub = status?.subscription;

    const manage = async () => {
        setBusy(true);
        try {
            const res = await databaseService.manageSubscription(false);
            if (res.url) window.location.assign(res.url);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Pagina dell’abbonamento non disponibile.', 'error');
        } finally {
            setBusy(false);
        }
    };

    let description: string;
    if (!premium) description = status?.trialAvailable ? `Piano Base. Puoi provare Premium gratis per ${status.trialDays} giorni.` : 'Piano Base, gratuito.';
    else if (sub && !sub.cancelAtPeriodEnd) description = `Si rinnova il ${formatDate(toISODate(new Date(sub.currentPeriodEnd)))} (${sub.period === 'year' ? 'annuale' : 'mensile'}, ${SOURCE_LABEL[sub.provider]}).`;
    else if (sub?.cancelAtPeriodEnd) description = `Rinnovo disdetto: Premium resta attivo fino al ${formatDate(toISODate(new Date(sub.currentPeriodEnd)))}.`;
    else description = until ? `Attivo fino al ${formatDate(toISODate(new Date(until)))}${status?.source ? ` (${SOURCE_LABEL[status.source] || status.source})` : ''}.` : 'Attivo.';

    return (
        <Group title="Piano">
            <Row
                icon="credit-card"
                title={<span className="flex items-center gap-2">{premium ? <>SwimIn Premium <PremiumBadge /></> : 'SwimIn Base'}</span>}
                description={failed && !premium ? 'Piano Base, gratuito.' : description}
                aside={
                    sub ? (
                        <button type="button" onClick={manage} disabled={busy} className={btn.secondary}>{busy ? 'Apertura…' : 'Gestisci abbonamento'}</button>
                    ) : (
                        <Link to="/premium" className={premium ? btn.secondary : btn.primary}>{premium ? 'Vedi i vantaggi' : 'Scopri Premium'}</Link>
                    )
                }
            />
            {status && status.inmailCredits > 0 && <Row title="Messaggi diretti disponibili" description={`${status.inmailCredits} questo mese, verso persone non collegate.`} />}
        </Group>
    );
};

const CONFIRM_WORD = 'ELIMINA';

const DeleteAccountRow: React.FC = () => {
    const { showToast } = useToast();
    const { logout } = useAuth();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [typed, setTyped] = useState('');
    const [deleting, setDeleting] = useState(false);

    const confirmDelete = async () => {
        setDeleting(true);
        try {
            await databaseService.deleteAccount(typed);
            showToast('Il tuo account è stato eliminato.', 'info');
            await logout().catch((err) => console.warn('Uscita dopo l’eliminazione:', err)); // la sessione è già invalidata
            navigate('/login', { replace: true });
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Eliminazione non riuscita.', 'error');
            setDeleting(false);
        }
    };

    return (
        <Row
            icon="trash"
            title="Elimina l’account"
            description="Cancella per sempre profilo, post, commenti, messaggi, candidature e collegamenti."
            aside={!open && <button type="button" onClick={() => setOpen(true)} className={btn.danger}>Elimina</button>}
        >
            {open && (
                <RowPanel withIcon>
                    <div className="max-w-md space-y-4">
                        <div className="text-sm text-slate-700 space-y-2">
                            <p className="font-semibold text-galleggiante-700">L’operazione non si può annullare.</p>
                            <p>Prima di procedere puoi scaricare una copia dei tuoi dati da <strong>Privacy e visibilità</strong>. Se hai Premium, disdici prima l’abbonamento.</p>
                        </div>
                        <Field id="confirm-delete" label={<>Per confermare scrivi <strong>{CONFIRM_WORD}</strong></>}>
                            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" disabled={deleting} />
                        </Field>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={confirmDelete} disabled={typed !== CONFIRM_WORD || deleting} className={btn.dangerSolid}>{deleting ? 'Eliminazione…' : 'Elimina definitivamente'}</button>
                            <button type="button" onClick={() => { setOpen(false); setTyped(''); }} disabled={deleting} className={btn.quiet}>Annulla</button>
                        </div>
                    </div>
                </RowPanel>
            )}
        </Row>
    );
};
