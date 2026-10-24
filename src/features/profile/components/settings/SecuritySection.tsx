import React, { useCallback, useEffect, useState } from 'react';
import type { Models } from 'appwrite';
import { account, listAccountLogs, type AccountLog } from '@/services/appwrite';
import { useToast } from '@/context/ToastContext';
import { authErrorMessage } from '@/utils/authErrors';
import { passwordStrength } from '@/utils/validation';
import { Field, fieldClass } from '@/components/form/Field';
import { PasswordMeter } from '@/components/form/PasswordMeter';
import { Icon, type IconType } from '@/components/ui/Icon';
import type { AuthenticatedUser } from '@/types/types';
import { TwoFactorSetup } from '../TwoFactorSetup';
import { Badge, Group, Row, RowPanel, RowSkeleton, SectionHeader, btn, whenOf } from './ui';

const isMobileSession = (s: Pick<Models.Session, 'deviceName' | 'osName'>) =>
    /smartphone|phone|tablet|mobile/i.test(s.deviceName || '') || /android|ios|ipad/i.test(s.osName || '');

const deviceLabel = (s: { clientName?: string; osName?: string; deviceBrand?: string; deviceModel?: string }) => {
    const client = s.clientName || 'Browser';
    const os = s.osName || [s.deviceBrand, s.deviceModel].filter(Boolean).join(' ');
    return os ? `${client} su ${os}` : client;
};

/** Eventi del registro di Appwrite, in parole semplici. */
const EVENT_LABELS: [RegExp, string, IconType][] = [
    [/session.*create|sessions.*create/, 'Accesso', 'key'],
    [/session.*delete|sessions.*delete/, 'Uscita', 'logout'],
    [/password/, 'Password cambiata', 'lock-closed'],
    [/email/, 'Email cambiata', 'mail'],
    [/mfa|authenticator|recovery/, 'Verifica in due passaggi modificata', 'shield'],
    [/verification/, 'Verifica dell’email', 'check-circle'],
];
const eventOf = (event: string): [string, IconType] => {
    const hit = EVENT_LABELS.find(([re]) => re.test(event));
    return hit ? [hit[1], hit[2]] : ['Modifica dell’account', 'settings'];
};

export const SecuritySection: React.FC<{ user: AuthenticatedUser }> = ({ user }) => (
    <>
        <SectionHeader title="Accesso e sicurezza" description="Password, verifica in due passaggi e dispositivi da cui hai effettuato l’accesso." />
        <div className="space-y-5">
            <Group title="Come accedi">
                <PasswordRow user={user} />
                <Row icon="shield" title="Verifica in due passaggi" description="Oltre alla password, all’accesso ti chiediamo un codice dall’app di autenticazione: chi scopre la password non può entrare.">
                    <div className="mt-4 sm:ml-14">
                        <TwoFactorSetup />
                    </div>
                </Row>
            </Group>
            <SessionsGroup />
            <ActivityGroup />
        </div>
    </>
);

const PasswordRow: React.FC<{ user: AuthenticatedUser }> = ({ user }) => {
    const { showToast } = useToast();
    const [open, setOpen] = useState(false);
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const [show, setShow] = useState(false);
    const [errors, setErrors] = useState<{ next?: string; confirm?: string }>({});
    const [saving, setSaving] = useState(false);
    const personal = [user.email.split('@')[0], user.name].filter(Boolean) as string[];
    const changedAt = (user as { passwordUpdate?: string }).passwordUpdate;

    const reset = () => {
        setOpen(false);
        setCurrent('');
        setNext('');
        setConfirm('');
        setErrors({});
        setShow(false);
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        const strength = passwordStrength(next, personal);
        const errs: typeof errors = {};
        if (strength.score < 1) errs.next = strength.hint || 'Scegli una password più robusta.';
        else if (next === current) errs.next = 'La nuova password deve essere diversa da quella attuale.';
        if (confirm !== next) errs.confirm = 'Le due password non coincidono.';
        setErrors(errs);
        if (errs.next || errs.confirm) return;
        setSaving(true);
        try {
            await account.updatePassword(next, current);
            reset();
            showToast('Password aggiornata. Gli altri dispositivi restano collegati: puoi disconnetterli qui sotto.', 'success');
        } catch (err) {
            showToast(authErrorMessage(err, 'Password attuale non corretta.'), 'error');
        } finally {
            setSaving(false);
        }
    };

    const toggle = (
        <button type="button" onClick={() => setShow((v) => !v)} className="text-xs font-semibold text-slate-600 hover:text-abisso px-2 py-1 rounded-lg" aria-label={show ? 'Nascondi le password' : 'Mostra le password'}>
            {show ? 'Nascondi' : 'Mostra'}
        </button>
    );

    return (
        <Row
            icon="lock-closed"
            title="Password"
            description={changedAt ? `Ultima modifica ${whenOf(changedAt)}.` : 'Usane una che non usi su altri siti.'}
            aside={!open && <button type="button" onClick={() => setOpen(true)} className={btn.secondary}>Cambia</button>}
        >
            {open && (
                <RowPanel withIcon>
                    <form onSubmit={submit} className="space-y-4 max-w-md" noValidate>
                        <Field id="pw-current" label="Password attuale" trailing={toggle}>
                            <input type={show ? 'text' : 'password'} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={fieldClass(undefined, 'pr-20')} required />
                        </Field>
                        <div>
                            <Field id="pw-new" label="Nuova password" hint="Almeno 8 caratteri. Una frase di più parole è facile da ricordare e difficile da indovinare." error={errors.next}>
                                <input type={show ? 'text' : 'password'} autoComplete="new-password" value={next} onChange={(e) => { setNext(e.target.value); setErrors((x) => ({ ...x, next: undefined })); }} minLength={8} required />
                            </Field>
                            <PasswordMeter id="pw-new-strength" password={next} personal={personal} />
                        </div>
                        <Field id="pw-confirm" label="Ripeti la nuova password" error={errors.confirm}>
                            <input type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => { setConfirm(e.target.value); setErrors((x) => ({ ...x, confirm: undefined })); }} required />
                        </Field>
                        <div className="flex flex-wrap gap-2">
                            <button type="submit" disabled={saving || !current || !next || !confirm} className={btn.primary}>{saving ? 'Salvataggio…' : 'Aggiorna la password'}</button>
                            <button type="button" onClick={reset} className={btn.quiet}>Annulla</button>
                        </div>
                    </form>
                </RowPanel>
            )}
        </Row>
    );
};

/** Sessioni aperte: dispositivo, luogo e data, con la possibilità di chiuderle. */
const SessionsGroup: React.FC = () => {
    const { showToast } = useToast();
    const [sessions, setSessions] = useState<Models.Session[] | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    const load = useCallback(() => {
        account
            .listSessions()
            .then(({ sessions: list }) => setSessions([...list].sort((a, b) => Number(b.current) - Number(a.current) || b.$createdAt.localeCompare(a.$createdAt))))
            .catch((err) => { console.warn('Sessioni:', err); setSessions([]); });
    }, []);
    useEffect(load, [load]);

    const end = async (id: string) => {
        setBusy(id);
        try {
            await account.deleteSession(id);
            setSessions((list) => (list || []).filter((s) => s.$id !== id));
            showToast('Dispositivo disconnesso.', 'success');
        } catch (err) {
            showToast(authErrorMessage(err, 'Operazione non riuscita.'), 'error');
        } finally {
            setBusy(null);
        }
    };

    const endOthers = async () => {
        if (!sessions) return;
        setBusy('others');
        try {
            await Promise.all(sessions.filter((s) => !s.current).map((s) => account.deleteSession(s.$id)));
            setSessions(sessions.filter((s) => s.current));
            showToast('Disconnesso da tutti gli altri dispositivi.', 'success');
        } catch (err) {
            showToast(authErrorMessage(err, 'Operazione non riuscita.'), 'error');
            load();
        } finally {
            setBusy(null);
        }
    };

    const others = (sessions || []).filter((s) => !s.current).length;

    return (
        <Group
            id="dispositivi"
            title="Dispositivi collegati"
            description="Dove hai effettuato l’accesso. Se non riconosci un dispositivo, disconnettilo e cambia la password."
            footer={others > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-slate-600">{others === 1 ? 'Un altro dispositivo collegato.' : `${others} altri dispositivi collegati.`}</p>
                    <button type="button" onClick={endOthers} disabled={busy !== null} className={btn.secondary}>{busy === 'others' ? 'Disconnessione…' : 'Esci da tutti gli altri'}</button>
                </div>
            ) : undefined}
        >
            {sessions === null ? (
                <RowSkeleton rows={2} />
            ) : sessions.length === 0 ? (
                <Row title="Elenco non disponibile" description="Non siamo riusciti a leggere i dispositivi collegati. Riprova più tardi." />
            ) : (
                sessions.map((s) => (
                    <Row
                        key={s.$id}
                        icon={isMobileSession(s) ? 'device-phone' : 'computer'}
                        title={<span className="flex flex-wrap items-center gap-2">{deviceLabel(s)} {s.current && <Badge tone="ok">Questo dispositivo</Badge>}</span>}
                        description={[s.countryName && s.countryName !== 'Unknown' ? s.countryName : '', `accesso ${whenOf(s.$createdAt)}`].filter(Boolean).join(' · ')}
                        aside={!s.current && <button type="button" onClick={() => end(s.$id)} disabled={busy !== null} className={btn.quiet}>{busy === s.$id ? 'Uscita…' : 'Disconnetti'}</button>}
                    />
                ))
            )}
        </Group>
    );
};

/** Ultime attività sull'account (accessi, cambi di password ed email), dal registro di Appwrite. */
const ActivityGroup: React.FC = () => {
    const [logs, setLogs] = useState<AccountLog[] | null>(null);
    const [all, setAll] = useState(false);

    useEffect(() => {
        listAccountLogs().then(setLogs).catch((err: unknown) => { console.warn('Attività:', err); setLogs([]); });
    }, []);

    if (logs !== null && logs.length === 0) return null;
    const shown = (logs || []).slice(0, all ? 25 : 5);

    return (
        <Group
            title="Attività recente"
            description="Gli ultimi accessi e le modifiche importanti all’account."
            footer={logs && logs.length > 5 ? (
                <button type="button" onClick={() => setAll((v) => !v)} className="py-1 -my-1 text-sm font-semibold text-corsia-700 hover:underline">{all ? 'Mostra meno' : 'Mostra altre attività'}</button>
            ) : undefined}
        >
            {logs === null ? (
                <RowSkeleton rows={3} />
            ) : (
                <ul className="divide-y divide-slate-100">
                    {shown.map((l, i) => {
                        const [label, icon] = eventOf(l.event);
                        return (
                            <li key={`${l.time}-${i}`} className="px-5 sm:px-6 py-3 flex items-center gap-4">
                                <span className="w-10 h-10 rounded-xl bg-slate-50 text-slate-500 grid place-items-center flex-shrink-0" aria-hidden="true"><Icon type={icon} className="w-5 h-5" /></span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-abisso">{label}</p>
                                    <p className="text-sm text-slate-500 break-words">{[deviceLabel(l), l.countryName && l.countryName !== 'Unknown' ? l.countryName : ''].filter(Boolean).join(' · ')}</p>
                                </div>
                                <time dateTime={l.time} className="text-sm text-slate-500 flex-shrink-0 text-right">{whenOf(l.time)}</time>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Group>
    );
};
