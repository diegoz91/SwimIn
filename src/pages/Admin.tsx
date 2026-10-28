import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useBlocks } from '@/context/BlocksContext';
import { useToast } from '@/context/ToastContext';
import { databaseService, type AdminOverview, type AdminReport, type AdminUserRow, type ClientErrorRow } from '@/services/database';
import { Icon } from '@/components/ui/Icon';
import { PageLoader } from '@/components/common/PageLoader';
import { formatRelativeTime } from '@/utils/format';
import { formatDate } from '@/utils/dates';
import type { Certification } from '@/types/types';
import { AdminPlans } from '@/features/admin/AdminPlans';
import { AdminStatus } from '@/features/admin/AdminStatus';
import { AdminErrors } from '@/features/admin/AdminErrors';
import { AdminFeedback } from '@/features/admin/AdminFeedback';
import { AdminAudit } from '@/features/admin/AdminAudit';
import { AdminBeta } from '@/features/admin/AdminBeta';
import { AdminLegal } from '@/features/admin/AdminLegal';
import { useConfirm } from '@/context/ConfirmContext';

type Tab = 'panoramica' | 'segnalazioni' | 'utenti' | 'piani' | 'errori' | 'verifiche' | 'stato' | 'feedback' | 'accessi' | 'autorita' | 'test';

const REASONS: Record<string, string> = {
    spam: 'Spam',
    molestie: 'Molestie',
    contenuto_inappropriato: 'Contenuto inappropriato',
    falso_profilo: 'Profilo falso',
    offerta_ingannevole: 'Offerta ingannevole',
    altro: 'Altro',
};
const TARGETS: Record<string, string> = { post: 'Post', comment: 'Commento', profile: 'Profilo', job: 'Annuncio', review: 'Recensione' };

const targetLink = (r: AdminReport) =>
    r.targetType === 'post' ? `/post/${r.targetId}` : r.targetType === 'profile' ? `/profile/${r.targetId}` : r.target.authorId ? `/profile/${r.target.authorId}` : null;

/** Pannello amministratori: segnalazioni, utenti, errori. Ogni azione è verificata dal server. */
const Admin: React.FC = () => {
    const confirm = useConfirm();
    usePageTitle('Amministrazione');
    const { isAdmin, isLegal } = useBlocks();
    const { showToast } = useToast();
    // ?tab=piani apre direttamente una scheda (link dal menu, schermate).
    const [tab, setTab] = useState<Tab>(() => {
        const t = new URLSearchParams(window.location.search).get('tab');
        return (['panoramica', 'segnalazioni', 'utenti', 'piani', 'errori', 'verifiche', 'stato', 'feedback', 'accessi', 'autorita', 'test'] as const).find((x) => x === t) ?? 'panoramica';
    });
    const tabsRef = useRef<HTMLDivElement>(null);
    // La scheda scelta resta visibile nella riga che scorre (su smartphone non ci stanno tutte).
    useEffect(() => {
        tabsRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
    }, [tab]);
    const [overview, setOverview] = useState<AdminOverview | null>(null);
    const [reportStatus, setReportStatus] = useState<'open' | 'resolved' | 'dismissed'>('open');
    const [reports, setReports] = useState<AdminReport[] | null>(null);
    const [errors, setErrors] = useState<ClientErrorRow[] | null>(null);
    const [userQuery, setUserQuery] = useState('');
    const [userRows, setUserRows] = useState<AdminUserRow[]>([]);
    const [busy, setBusy] = useState<string | null>(null);
    const [feedbackOpen, setFeedbackOpen] = useState<number | null>(null);

    const onCertCount = useCallback((n: number) => setOverview((o) => (o ? { ...o, pendingCerts: n } : o)), []);
    const fail = useCallback((e: unknown) => showToast(e instanceof Error ? e.message : 'Operazione non riuscita.', 'error'), [showToast]);

    useEffect(() => {
        if (!isAdmin) return;
        databaseService.adminOverview().then(setOverview).catch(fail);
    }, [isAdmin, fail]);

    useEffect(() => {
        if (!isAdmin || tab !== 'segnalazioni') return;
        setReports(null);
        databaseService.adminListReports(reportStatus).then(setReports).catch((e) => { fail(e); setReports([]); });
    }, [isAdmin, tab, reportStatus, fail]);

    useEffect(() => {
        if (!isAdmin || tab !== 'errori') return;
        databaseService.adminListErrors().then(setErrors).catch((e) => { fail(e); setErrors([]); });
    }, [isAdmin, tab, fail]);

    useEffect(() => {
        if (!isAdmin || tab !== 'utenti' || userQuery.trim().length < 2) return setUserRows([]);
        const t = window.setTimeout(() => databaseService.adminSearchUsers(userQuery).then(setUserRows).catch(fail), 350);
        return () => window.clearTimeout(t);
    }, [isAdmin, tab, userQuery, fail]);

    if (!isAdmin) {
        return (
            <div className="max-w-lg mx-auto text-center py-24">
                <Icon type="shield" className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                <h1 className="text-3xl font-bold text-abisso">Area riservata</h1>
                <p className="text-slate-500 mt-2">Questa sezione è disponibile solo per gli amministratori di SwimIn.</p>
                <Link to="/" className="inline-block mt-6 font-semibold text-corsia-700 hover:underline">Torna alla home</Link>
            </div>
        );
    }

    const resolve = async (r: AdminReport, decision: 'dismiss' | 'remove' | 'suspend') => {
        const question = { dismiss: 'Archiviare la segnalazione senza azioni?', remove: 'Rimuovere il contenuto segnalato? L’autore riceverà una notifica.', suspend: `Sospendere l’account di ${r.target.authorName || 'questo utente'}? Non potrà più accedere.` }[decision];
        if (!(await confirm({ title: { dismiss: 'Archiviare la segnalazione?', remove: 'Rimuovere il contenuto?', suspend: 'Sospendere l’account?' }[decision], message: question, confirmLabel: { dismiss: 'Archivia', remove: 'Rimuovi', suspend: 'Sospendi' }[decision], tone: decision === 'dismiss' ? 'default' : 'danger' }))) return;
        setBusy(r.$id);
        try {
            const res = await databaseService.adminResolveReport(r.$id, decision);
            setReports((prev) => (prev || []).filter((x) => x.targetId !== r.targetId));
            showToast(res.closed > 1 ? `Fatto: chiuse ${res.closed} segnalazioni sullo stesso contenuto.` : 'Segnalazione chiusa.', 'success');
            setOverview((o) => (o ? { ...o, openReports: Math.max(0, o.openReports - res.closed) } : o));
        } catch (e) {
            fail(e);
        } finally {
            setBusy(null);
        }
    };

    const toggleSuspend = async (u: AdminUserRow) => {
        if (!(await confirm({ title: u.suspended ? `Riattivare l’account di ${u.name}?` : `Sospendere l’account di ${u.name}?`, message: u.suspended ? 'Potrà di nuovo accedere e usare SwimIn.' : 'Non potrà più accedere finché non lo riattivi.', confirmLabel: u.suspended ? 'Riattiva' : 'Sospendi', tone: u.suspended ? 'default' : 'danger' }))) return;
        try {
            await databaseService.adminSetSuspended(u.$id, !u.suspended);
            setUserRows((rows) => rows.map((x) => (x.$id === u.$id ? { ...x, suspended: !u.suspended } : x)));
            showToast(u.suspended ? 'Account riattivato.' : 'Account sospeso.', 'success');
        } catch (e) {
            fail(e);
        }
    };

    const grantPremium = async (u: AdminUserRow, days: number) => {
        if (!(await confirm({ title: `Regalare ${days} giorni di Premium?`, message: `${u.name} riceverà una notifica e avrà subito tutti i vantaggi.`, confirmLabel: 'Regala Premium' }))) return;
        try {
            const r = await databaseService.adminGrantPremium(u.$id, days);
            showToast(`Premium attivo fino al ${r.premiumUntil.slice(8, 10)}/${r.premiumUntil.slice(5, 7)}/${r.premiumUntil.slice(0, 4)}.`, 'success');
        } catch (e) {
            fail(e);
        }
    };

    const TABS: { id: Tab; label: string; badge?: number }[] = [
        { id: 'panoramica', label: 'Panoramica' },
        { id: 'segnalazioni', label: 'Segnalazioni', badge: overview?.openReports },
        { id: 'feedback', label: 'Suggerimenti', badge: feedbackOpen ?? overview?.openFeedback },
        { id: 'verifiche', label: 'Brevetti', badge: overview?.pendingCerts },
        { id: 'utenti', label: 'Utenti' },
        { id: 'piani', label: 'Piani e prezzi' },
        { id: 'errori', label: 'Errori', badge: overview?.errors24h },
        { id: 'stato', label: 'Stato del servizio' },
        { id: 'test', label: 'Fase di test' },
        { id: 'accessi', label: 'Registro accessi' },
        // Solo per il responsabile delle richieste delle autorità (etichette admin + legal, verificate dal server).
        ...(isLegal ? [{ id: 'autorita' as const, label: 'Richieste autorità' }] : []),
    ];

    return (
        <div className="pt-4 max-w-5xl mx-auto w-full">
            <h1 className="text-4xl font-bold text-abisso leading-none">Amministrazione</h1>
            <div ref={tabsRef} className="flex gap-2 overflow-x-auto mt-5 mb-6 pb-1" role="tablist">
                {TABS.map((t) => (
                    <button
                        key={t.id}
                        role="tab"
                        aria-selected={tab === t.id}
                        onClick={() => setTab(t.id)}
                        className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold border transition ${tab === t.id ? 'bg-abisso text-white border-abisso' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                    >
                        {t.label}
                        {!!t.badge && <span className={`ml-2 px-1.5 rounded-full text-xs ${tab === t.id ? 'bg-white/20' : 'bg-galleggiante text-white'}`}>{t.badge}</span>}
                    </button>
                ))}
            </div>

            {tab === 'panoramica' && (
                overview ? (
                    <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {[
                            ['Persone', overview.people],
                            ['Strutture', overview.structures],
                            ['Post', overview.posts],
                            ['Segnalazioni aperte', overview.openReports],
                            ['Brevetti da verificare', overview.pendingCerts],
                            ['Errori nelle ultime 24 ore', overview.errors24h],
                        ].map(([label, value]) => (
                            <div key={label as string} className="bg-white rounded-2xl border border-slate-200 shadow-card px-5 py-4">
                                <dt className="text-sm text-slate-500">{label}</dt>
                                <dd className="font-display text-4xl font-bold text-abisso">{value}</dd>
                            </div>
                        ))}
                    </dl>
                ) : <PageLoader />
            )}

            {tab === 'segnalazioni' && (
                <>
                    <div className="flex gap-2 mb-4">
                        {(['open', 'resolved', 'dismissed'] as const).map((s) => (
                            <button key={s} onClick={() => setReportStatus(s)} aria-pressed={reportStatus === s} className={`px-3 py-1.5 rounded-full text-sm font-semibold ${reportStatus === s ? 'bg-corsia-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
                                {{ open: 'Aperte', resolved: 'Risolte', dismissed: 'Archiviate' }[s]}
                            </button>
                        ))}
                    </div>
                    {reports === null ? <PageLoader /> : reports.length === 0 ? (
                        <p className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500">Nessuna segnalazione {reportStatus === 'open' ? 'da gestire' : 'in questo elenco'}.</p>
                    ) : (
                        <ul className="space-y-3">
                            {reports.map((r) => {
                                const link = targetLink(r);
                                return (
                                    <li key={r.$id} className="bg-white rounded-2xl border border-slate-200 shadow-card p-5">
                                        <div className="flex flex-wrap items-center gap-2 text-sm">
                                            <span className="px-2 py-0.5 rounded-md bg-red-50 text-red-700 font-semibold">{REASONS[r.reason] || r.reason}</span>
                                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">{TARGETS[r.targetType] || r.targetType}</span>
                                            <span className="text-slate-500">da {r.reporterName || 'utente'} · {formatRelativeTime(r.$createdAt)}</span>
                                        </div>
                                        {r.target.exists ? (
                                            <blockquote className="mt-3 border-l-4 border-slate-200 pl-3 text-slate-700 whitespace-pre-wrap line-clamp-4">{r.target.text || '(senza testo)'}</blockquote>
                                        ) : (
                                            <p className="mt-3 text-sm text-slate-500">Il contenuto non esiste più.</p>
                                        )}
                                        <p className="text-sm text-slate-500 mt-2">
                                            Autore: {r.target.authorName || '—'} {r.target.suspended && <span className="text-galleggiante-700 font-semibold">(sospeso)</span>}
                                            {link && <> · <Link to={link} className="text-corsia-700 font-semibold hover:underline">Apri</Link></>}
                                        </p>
                                        {r.details && <p className="text-sm text-slate-600 mt-2 bg-piastrella rounded-lg px-3 py-2">“{r.details}”</p>}
                                        {r.status === 'open' ? (
                                            <div className="flex flex-wrap gap-2 mt-4">
                                                <button disabled={busy === r.$id} onClick={() => resolve(r, 'dismiss')} className="px-4 py-2 rounded-full text-sm font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50">Archivia</button>
                                                {r.target.exists && ['post', 'comment', 'job', 'review'].includes(r.targetType) && (
                                                    <button disabled={busy === r.$id} onClick={() => resolve(r, 'remove')} className="px-4 py-2 rounded-full text-sm font-semibold bg-amber-100 text-amber-900 hover:bg-amber-200 disabled:opacity-50">Rimuovi contenuto</button>
                                                )}
                                                {r.target.authorId && !r.target.suspended && (
                                                    <button disabled={busy === r.$id} onClick={() => resolve(r, 'suspend')} className="px-4 py-2 rounded-full text-sm font-semibold bg-galleggiante text-white hover:bg-red-700 disabled:opacity-50">Sospendi autore</button>
                                                )}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-slate-500 mt-3">Decisione: {{ dismiss: 'archiviata', remove: 'contenuto rimosso', suspend: 'autore sospeso' }[r.resolution || ''] || r.resolution}</p>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </>
            )}

            {tab === 'verifiche' && <AdminVerifications onCountChange={onCertCount} />}

            {tab === 'piani' && <AdminPlans />}

            {tab === 'test' && <AdminBeta />}

            {tab === 'accessi' && <AdminAudit />}

            {tab === 'autorita' && (isLegal ? <AdminLegal /> : <p className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500">Questa sezione è riservata al responsabile delle richieste delle autorità.</p>)}

            {tab === 'utenti' && (
                <>
                    <input
                        type="search"
                        value={userQuery}
                        onChange={(e) => setUserQuery(e.target.value)}
                        placeholder="Nome, cognome, struttura o email"
                        aria-label="Cerca utenti"
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white mb-4 focus:border-corsia-400 focus:ring-4 focus:ring-corsia-100 outline-hidden"
                    />
                    <ul className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
                        {userRows.length === 0 && <li className="p-6 text-sm text-slate-500 text-center">{userQuery.trim().length < 2 ? 'Scrivi almeno due lettere.' : 'Nessun utente trovato.'}</li>}
                        {userRows.map((u) => (
                            <li key={u.$id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                                <div className="min-w-0 flex-1">
                                    <Link to={`/profile/${u.$id}`} className="font-semibold text-abisso hover:underline">{u.name}</Link>
                                    <p className="text-xs text-slate-500 truncate">{[u.email, u.userType === 'structure' ? 'Struttura' : u.personType === 'enthusiast' ? 'Appassionato' : 'Professionista', u.city].filter(Boolean).join(' · ')}</p>
                                </div>
                                {u.suspended && <span className="text-xs font-semibold text-galleggiante-700">Sospeso</span>}
                                <button onClick={() => grantPremium(u, 30)} className="px-4 py-2 rounded-full text-sm font-semibold bg-oro-50 text-oro-700 hover:bg-oro-100">Premium 30 giorni</button>
                                <button onClick={() => toggleSuspend(u)} className={`px-4 py-2 rounded-full text-sm font-semibold ${u.suspended ? 'bg-slate-100 text-slate-700' : 'bg-red-50 text-galleggiante-700 hover:bg-red-100'}`}>
                                    {u.suspended ? 'Riattiva' : 'Sospendi'}
                                </button>
                            </li>
                        ))}
                    </ul>
                </>
            )}

            {tab === 'errori' && (errors === null ? <PageLoader variant="list" /> : <AdminErrors rows={errors} />)}
            {tab === 'stato' && <AdminStatus />}
            {tab === 'feedback' && <AdminFeedback onOpenCount={setFeedbackOpen} />}
        </div>
    );
};

type PendingCert = { profileId: string; name: string; city: string; cert: Certification };

/** Coda di verifica dei brevetti: documento allegato, dati dichiarati, approva o respingi con motivo. */
const AdminVerifications: React.FC<{ onCountChange: (n: number) => void }> = ({ onCountChange }) => {
    const { showToast } = useToast();
    const [items, setItems] = useState<PendingCert[] | null>(null);
    const [open, setOpen] = useState<string | null>(null);
    const [doc, setDoc] = useState<{ key: string; mimeType: string; dataUrl: string; name: string } | null>(null);
    const [docError, setDocError] = useState<string | null>(null);
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const keyOf = (i: PendingCert) => `${i.profileId}:${i.cert.id}`;

    const load = useCallback(async () => {
        try {
            const rows = await databaseService.adminListPendingCerts();
            setItems(rows);
            onCountChange(rows.length);
        } catch (err) {
            console.error('Brevetti in attesa:', err);
            showToast('Impossibile caricare i brevetti in attesa.', 'error');
            setItems([]);
        }
    }, [onCountChange, showToast]);

    useEffect(() => { void load(); }, [load]);

    const expand = async (item: PendingCert) => {
        const key = keyOf(item);
        if (open === key) { setOpen(null); return; }
        setOpen(key);
        setNote('');
        setDocError(null);
        if (doc?.key === key) return;
        setDoc(null);
        try {
            const d = await databaseService.adminGetCertDocument(item.profileId, item.cert.id!);
            setDoc({ key, ...d });
        } catch (err) {
            console.error('Documento brevetto:', err);
            setDocError(err instanceof Error ? err.message : 'Documento non disponibile.');
        }
    };

    const decide = async (item: PendingCert, approve: boolean) => {
        if (!approve && !note.trim()) { showToast('Scrivi il motivo del rifiuto: lo leggerà l’utente.', 'error'); return; }
        setBusy(true);
        try {
            await databaseService.adminVerifyCert(item.profileId, item.cert.id!, approve, note.trim());
            showToast(approve ? 'Brevetto verificato.' : 'Verifica respinta, utente avvisato.', 'success');
            const rest = (items || []).filter((i) => keyOf(i) !== keyOf(item));
            setItems(rest);
            onCountChange(rest.length);
            setOpen(null);
        } catch (err) {
            console.error('Esito verifica:', err);
            showToast(err instanceof Error ? err.message : 'Operazione non riuscita.', 'error');
        } finally {
            setBusy(false);
        }
    };

    if (items === null) return <PageLoader />;
    if (items.length === 0) {
        return <p className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500">Nessun brevetto in attesa di verifica.</p>;
    }

    return (
        <ul className="space-y-3">
            {items.map((item) => {
                const key = keyOf(item);
                const isOpen = open === key;
                const c = item.cert;
                return (
                    <li key={key} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                        <button type="button" onClick={() => expand(item)} aria-expanded={isOpen} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-corsia-500">
                            <Icon type="shield" className="w-5 h-5 text-corsia-600 shrink-0" />
                            <span className="min-w-0 flex-1">
                                <span className="block font-semibold text-abisso truncate">{c.name}</span>
                                <span className="block text-xs text-slate-500 truncate">{item.name}{item.city ? `, ${item.city}` : ''}</span>
                            </span>
                            <Icon type="chevron-right" className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                        </button>
                        {isOpen && (
                            <div className="border-t border-slate-100 p-4 grid gap-4 md:grid-cols-[1fr_16rem]">
                                <div className="rounded-xl bg-piastrella border border-slate-200 min-h-[16rem] flex items-center justify-center overflow-hidden">
                                    {docError ? (
                                        <p className="text-sm text-galleggiante-700 p-4 text-center">{docError}</p>
                                    ) : doc?.key !== key ? (
                                        <PageLoader />
                                    ) : doc.mimeType === 'application/pdf' ? (
                                        <object data={doc.dataUrl} type="application/pdf" className="w-full h-[28rem]" aria-label={`Documento: ${c.name}`}>
                                            <a href={doc.dataUrl} download={doc.name} className="text-corsia-700 font-semibold underline p-4">Scarica il PDF</a>
                                        </object>
                                    ) : (
                                        <img src={doc.dataUrl} alt={`Documento: ${c.name}`} className="max-h-[28rem] w-auto object-contain" />
                                    )}
                                </div>
                                <div className="space-y-3 text-sm">
                                    <dl className="space-y-2">
                                        <div><dt className="text-xs text-slate-500">Ente</dt><dd className="font-semibold text-abisso">{c.issuer || '—'}</dd></div>
                                        {c.credentialId && <div><dt className="text-xs text-slate-500">Numero</dt><dd className="font-semibold text-abisso">{c.credentialId}</dd></div>}
                                        {c.issueDate && <div><dt className="text-xs text-slate-500">Rilascio</dt><dd className="font-semibold text-abisso">{formatDate(c.issueDate, 'short')}</dd></div>}
                                        {c.expiry && <div><dt className="text-xs text-slate-500">Scadenza</dt><dd className="font-semibold text-abisso">{formatDate(c.expiry, 'short')}</dd></div>}
                                    </dl>
                                    <Link to={`/profile/${item.profileId}`} className="inline-block text-corsia-700 font-semibold hover:underline">Apri il profilo</Link>
                                    <label className="block">
                                        <span className="block text-xs text-slate-500 mb-1">Motivo del rifiuto (obbligatorio per respingere)</span>
                                        <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} rows={3} className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-corsia-400 focus:ring-4 focus:ring-corsia-100 outline-hidden resize-none" placeholder="Es. il numero non corrisponde al documento" />
                                    </label>
                                    <div className="flex gap-2">
                                        <button type="button" disabled={busy} onClick={() => decide(item, true)} className="flex-1 px-4 py-2 rounded-full bg-corsia-600 text-white font-semibold hover:bg-corsia-700 disabled:opacity-60">Approva</button>
                                        <button type="button" disabled={busy} onClick={() => decide(item, false)} className="flex-1 px-4 py-2 rounded-full bg-red-50 text-galleggiante-700 font-semibold hover:bg-red-100 disabled:opacity-60">Respingi</button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </li>
                );
            })}
        </ul>
    );
};

export default Admin;
