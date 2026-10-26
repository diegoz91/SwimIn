import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, databaseService } from '@/services/database';
import { useToast } from '@/context/ToastContext';
import { useContactInfo } from '@/hooks/useContactInfo';
import { downloadResume, openResume } from '@/services/resume';
import { useSignal } from '@/hooks/useSignal';
import { Icon } from '@/components/ui/Icon';
import { FormModal } from '@/components/form/FormModal';
import { PremiumBadge } from '@/features/premium/PremiumBadge';
import { avatarOf, displayNameOf, headlineOf } from '@/utils/profile';
import { isPremium } from '@/utils/premium';
import { swimMatchScore } from '@/utils/swimMatch';
import { formatRelativeTime } from '@/utils/format';
import { formatDate } from '@/utils/dates';
import type { Application, ApplicationReview, Certification, Job, UserProfile } from '@/types/types';
import { InterviewModal, MODE_LABEL, StarRating, interviewChip } from './Interview';
import { PIPELINE, STATUS, type ApplicationStatus, type PipelineId } from '../applicationStatus';

type Row = Application & { profile?: UserProfile };

const parseCerts = (list?: string[]): Certification[] =>
    (list || []).flatMap((c) => {
        try {
            return [JSON.parse(c) as Certification];
        } catch {
            return [];
        }
    });

const daysTo = (iso?: string) => (iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000) : null);

/**
 * Candidati di un annuncio per chi lo gestisce, divisi per fase come in un piccolo gestionale:
 * nuove, viste, selezionate per un colloquio, assunte, scartate. Aprire una candidatura nuova
 * la segna come vista (il candidato lo vede nel suo percorso, senza notifiche).
 */
export const CandidatesPanel: React.FC<{ job: Job; onHired?: () => void }> = ({ job, onHired }) => {
    const { showToast } = useToast();
    const [params, setParams] = useSearchParams();
    const [rows, setRows] = useState<Row[] | null>(null);
    const [open, setOpen] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [hiring, setHiring] = useState<Row | null>(null);
    const [interviewing, setInterviewing] = useState<Row | null>(null);
    const [reviews, setReviews] = useState<Record<string, ApplicationReview>>({});

    const load = useCallback(async () => {
        try {
            const apps = await databaseService.getJobApplications(job.$id);
            const profiles = await databaseService.getConnectionsProfiles(apps.map((a) => a.applicantId));
            const byId = new Map(profiles.map((p) => [p.$id, p as UserProfile]));
            setRows(apps.map((a) => ({ ...a, profile: byId.get(a.applicantId) })));
            // Note e valutazioni interne: se non arrivano, l'elenco resta comunque usabile.
            databaseService.getApplicationReviews(job.$id).then(setReviews, (err) => console.error('Valutazioni interne:', err));
        } catch (err) {
            console.error('Candidati:', err);
            setRows([]);
        }
    }, [job.$id]);

    useEffect(() => {
        void load();
    }, [load]);

    // Tempo reale: nuove candidature e ritiri compaiono senza ricaricare la pagina.
    useSignal(`job:${job.$id}`, () => void load());

    // Una candidatura nuova aperta ora diventa "vista", ma resta nell'elenco finché non si cambia scheda.
    const [sticky, setSticky] = useState<Set<string>>(new Set());
    const groups = useMemo(
        () => PIPELINE.map((g) => ({ ...g, rows: (rows || []).filter((r) => g.statuses.includes(sticky.has(r.$id) && r.status === 'reviewed' ? 'pending' : r.status)) })),
        [rows, sticky]
    );
    const requested = params.get('candidati') as PipelineId | null;
    const firstFull = groups.find((g) => g.rows.length)?.id || 'nuove';
    const tab: PipelineId = groups.some((g) => g.id === requested) ? (requested as PipelineId) : firstFull;
    const current = groups.find((g) => g.id === tab)!;

    const setTab = (id: PipelineId) => {
        const next = new URLSearchParams(params);
        next.set('candidati', id);
        setParams(next, { replace: true });
        setOpen(null);
        setSticky(new Set());
    };

    const setStatus = async (row: Row, status: Exclude<ApplicationStatus, 'hired'>, quiet = false) => {
        setBusy(row.$id);
        const updated = await databaseService.updateApplicationStatus(row.$id, status);
        setBusy(null);
        if (!updated) {
            if (!quiet) showToast('Non è stato possibile aggiornare la candidatura.', 'error');
            return;
        }
        setRows((prev) => (prev || []).map((r) => (r.$id === row.$id ? { ...r, status } : r)));
        if (quiet) return;
        const name = displayNameOf(row.profile);
        showToast(
            status === 'accepted' ? `${name} è tra i selezionati: l’abbiamo avvisato.` : status === 'rejected' ? `Candidatura di ${name} scartata: riceve un avviso cortese.` : `${name} è di nuovo in valutazione.`,
            status === 'rejected' ? 'info' : 'success'
        );
    };

    const toggle = (row: Row) => {
        const opening = open !== row.$id;
        setOpen(opening ? row.$id : null);
        if (opening && row.status === 'pending') {
            setSticky((prev) => new Set(prev).add(row.$id));
            void setStatus(row, 'reviewed', true);
        }
    };

    const confirmHire = async () => {
        if (!hiring) return;
        setBusy(hiring.$id);
        try {
            await databaseService.hireCandidate(hiring.$id);
            setRows((prev) => (prev || []).map((r) => (r.$id === hiring.$id ? { ...r, status: 'hired' } : r)));
            showToast(`${displayNameOf(hiring.profile)} fa parte dello staff. L’annuncio è stato chiuso.`, 'success');
            setHiring(null);
            onHired?.();
        } catch (err) {
            console.error('Assunzione:', err);
            // Limite del piano Base: l'invito a Premium si apre da solo.
            if (!(err instanceof ApiError && err.code === 'premium_required')) showToast(err instanceof Error ? err.message : 'Assunzione non riuscita.', 'error');
            if (err instanceof ApiError && err.code === 'premium_required') setHiring(null);
        } finally {
            setBusy(null);
        }
    };

    return (
        <section id="candidati" className="bg-white rounded-3xl border border-slate-200 shadow-card overflow-hidden scroll-mt-4" aria-labelledby="candidates-title">
            <div className="px-5 sm:px-6 pt-5 flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="candidates-title" className="text-2xl font-bold text-abisso">Candidati</h2>
                {rows && <p className="text-sm text-slate-500">{rows.length === 1 ? '1 candidatura' : `${rows.length} candidature`}</p>}
            </div>

            <div className="mt-3 px-3 sm:px-4 flex gap-1 overflow-x-auto border-b border-slate-100" role="tablist" aria-label="Fasi delle candidature">
                {groups.map((g) => (
                    <button
                        key={g.id}
                        role="tab"
                        aria-selected={tab === g.id}
                        onClick={() => setTab(g.id)}
                        className={`flex-shrink-0 px-3 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === g.id ? 'border-corsia-600 text-corsia-800' : 'border-transparent text-slate-500 hover:text-abisso'}`}
                    >
                        {g.label}
                        <span className={`ml-1.5 tabular-nums px-1.5 py-0.5 rounded-full text-xs ${g.id === 'nuove' && g.rows.length ? 'bg-corsia-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{g.rows.length}</span>
                    </button>
                ))}
            </div>

            {rows === null ? (
                <div className="p-5 space-y-3" aria-hidden="true">
                    {[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-2xl bg-slate-100 animate-pulse" />)}
                </div>
            ) : current.rows.length === 0 ? (
                <p className="p-8 text-center text-slate-500">
                    {rows.length === 0
                        ? job.isActive ? 'Ancora nessuna candidatura. Condividi l’annuncio per farlo vedere a più persone.' : 'Questo annuncio non ha ricevuto candidature.'
                        : `Nessuna candidatura in “${current.label.toLowerCase()}”.`}
                </p>
            ) : (
                <ul className="divide-y divide-slate-100">
                    {current.rows.map((row) => (
                        <CandidateRow
                            key={row.$id}
                            row={row}
                            job={job}
                            expanded={open === row.$id}
                            busy={busy === row.$id}
                            onToggle={() => toggle(row)}
                            onStatus={(s) => setStatus(row, s)}
                            onHire={() => setHiring(row)}
                            onInterview={() => setInterviewing(row)}
                            review={reviews[row.$id]}
                            onReview={(rv) => setReviews((prev) => ({ ...prev, [row.$id]: rv }))}
                        />
                    ))}
                </ul>
            )}

            <InterviewModal
                application={interviewing}
                candidateName={displayNameOf(interviewing?.profile)}
                onClose={() => setInterviewing(null)}
                onSaved={(a) => setRows((prev) => (prev || []).map((r) => (r.$id === a.$id ? { ...r, ...a, profile: r.profile } : r)))}
            />

            <FormModal
                open={!!hiring}
                title={`Assumi ${displayNameOf(hiring?.profile)}`}
                icon="check-circle"
                submitLabel="Assumi"
                busyLabel="Assunzione…"
                busy={!!hiring && busy === hiring.$id}
                onClose={() => setHiring(null)}
                onSubmit={(e) => {
                    e.preventDefault();
                    void confirmHire();
                }}
            >
                <ul className="space-y-2 text-sm text-slate-700">
                    <li className="flex gap-2"><Icon type="check" className="w-4 h-4 mt-0.5 text-cloro-700 flex-shrink-0" /> Entra nello staff: vede bacheca, turni e chat della struttura.</li>
                    <li className="flex gap-2"><Icon type="check" className="w-4 h-4 mt-0.5 text-cloro-700 flex-shrink-0" /> Riceve subito una notifica.</li>
                    <li className="flex gap-2"><Icon type="check" className="w-4 h-4 mt-0.5 text-cloro-700 flex-shrink-0" /> L’annuncio si chiude e non riceve altre candidature (puoi riaprirlo).</li>
                </ul>
            </FormModal>
        </section>
    );
};

const CandidateRow: React.FC<{
    row: Row;
    job: Job;
    expanded: boolean;
    busy: boolean;
    onToggle: () => void;
    onStatus: (s: Exclude<ApplicationStatus, 'hired'>) => void;
    onHire: () => void;
    onInterview: () => void;
    review?: ApplicationReview;
    onReview: (r: ApplicationReview) => void;
}> = ({ row, job, expanded, busy, onToggle, onStatus, onHire, onInterview, review, onReview }) => {
    const { showToast } = useToast();
    const p = row.profile;
    const name = displayNameOf(p);
    const score = p ? swimMatchScore(p, job) : null;
    const certs = parseCerts(p?.certificationsList);
    const contact = useContactInfo(row.applicantId, expanded);
    const panelId = `cand-${row.$id}`;
    const status = STATUS[row.status];
    const chip = interviewChip(row);
    const closed = row.status === 'hired' || row.status === 'rejected';

    return (
        <li className={expanded ? 'bg-piastrella/60' : ''}>
            <div className="px-5 sm:px-6 py-4 flex items-start gap-3">
                <img src={avatarOf(p)} alt="" className="w-12 h-12 rounded-full object-cover bg-slate-100 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Link to={`/profile/${row.applicantId}`} className="font-semibold text-abisso hover:underline">{name}</Link>
                        {isPremium(p) && <PremiumBadge />}
                        {row.priority && <span className="text-xs font-semibold text-oro-700">In evidenza</span>}
                    </div>
                    <p className="text-sm text-slate-600 truncate">{headlineOf(p)}</p>
                    {(!!review?.rating || chip) && (
                        <p className="mt-1 flex flex-wrap items-center gap-2">
                            {!!review?.rating && <StarRating value={review.rating} size="sm" label="Valutazione interna" />}
                            {chip && <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${chip.cls}`}>{chip.text}{row.interviewDate ? ` · ${formatDate(row.interviewDate, 'short')} ${row.interviewTime || ''}` : ''}</span>}
                        </p>
                    )}
                    <p className="text-xs text-slate-500 mt-0.5">
                        {[p?.city && `${p.city}${p.province ? ` (${p.province})` : ''}`, `candidatura ${formatRelativeTime(row.$createdAt)}`].filter(Boolean).join(' · ')}
                    </p>
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    {row.resumeFileId && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 inline-flex items-center gap-1"><Icon type="document" className="w-3 h-3" />CV</span>}
                    {score !== null && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${score >= 80 ? 'bg-cloro-100 text-cloro-800' : score >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`} title="Requisiti dell’annuncio soddisfatti dal profilo">
                            Affinità {score}%
                        </span>
                    )}
                    <button onClick={onToggle} aria-expanded={expanded} aria-controls={panelId} className="py-1 -my-1 text-sm font-semibold text-corsia-700 hover:text-corsia-900 inline-flex items-center gap-1">
                        {expanded ? 'Chiudi' : 'Valuta'}
                        <Icon type="chevron-right" className={`w-4 h-4 transition-transform ${expanded ? '-rotate-90' : 'rotate-90'}`} />
                    </button>
                </div>
            </div>

            {expanded && (
                <div id={panelId} className="px-5 sm:px-6 pb-5 space-y-4">
                    <p className="text-xs text-slate-500">
                        Stato: <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-semibold ${status.tone}`}><Icon type={status.icon} className="w-3 h-3" />{status.manager}</span>
                    </p>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-2xl bg-white border border-slate-200 p-4">
                            <h3 className="text-sm font-semibold text-abisso">Presentazione</h3>
                            <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{row.coverLetter?.trim() || (row.resumeFileId ? 'Candidatura rapida con CV, senza messaggio.' : 'Candidatura rapida, senza messaggio: il profilo parla per lei.')}</p>
                            {row.resumeFileId && (
                                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                                    <span className="inline-flex items-center gap-2 text-sm text-slate-700 min-w-0">
                                        <span className="px-1.5 py-0.5 rounded bg-red-50 border border-red-100 text-galleggiante-700 text-[11px] font-bold" aria-hidden="true">PDF</span>
                                        <span className="break-all">{row.resumeName || 'CV'}</span>
                                    </span>
                                    <span className="flex gap-3 ml-auto">
                                        <button type="button" onClick={() => openResume(row.resumeFileId as string).catch((err) => showToast(err instanceof Error ? err.message : 'CV non disponibile.', 'error'))} className="py-1 -my-1 text-sm font-semibold text-corsia-700 hover:underline">Apri il CV</button>
                                        <button type="button" onClick={() => downloadResume(row.resumeFileId as string, row.resumeName || 'CV.pdf').catch((err) => showToast(err instanceof Error ? err.message : 'CV non disponibile.', 'error'))} className="py-1 -my-1 text-sm font-semibold text-corsia-700 hover:underline">Scarica</button>
                                    </span>
                                </div>
                            )}
                        </div>
                        <div className="rounded-2xl bg-white border border-slate-200 p-4">
                            <h3 className="text-sm font-semibold text-abisso">Brevetti</h3>
                            {certs.length === 0 ? (
                                <p className="text-sm text-slate-500 mt-1">Nessun brevetto inserito nel profilo.</p>
                            ) : (
                                <ul className="mt-1 space-y-1">
                                    {certs.slice(0, 6).map((c, i) => {
                                        const d = daysTo(c.expiry);
                                        return (
                                            <li key={i} className="text-sm flex flex-wrap justify-between gap-x-2">
                                                <span className="text-slate-800">{c.name}{c.verificationStatus === 'approved' && <span className="ml-1 text-xs font-semibold text-cloro-700">verificato</span>}</span>
                                                {c.expiry && <span className={`text-xs ${d !== null && d < 0 ? 'text-galleggiante-700 font-semibold' : 'text-slate-500'}`}>{d !== null && d < 0 ? 'scaduto' : `scade ${formatDate(c.expiry.slice(0, 10), 'short')}`}</span>}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    </div>
                    {(row.interviewStatus || !closed) && (
                        <div className="rounded-2xl bg-white border border-slate-200 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <h3 className="text-sm font-semibold text-abisso">Colloquio</h3>
                                {!closed && (
                                    <button type="button" disabled={busy} onClick={onInterview} className="py-1 -my-1 text-sm font-semibold text-corsia-700 hover:underline inline-flex items-center gap-1.5 disabled:opacity-60">
                                        <Icon type="calendar" className="w-4 h-4" />
                                        {row.interviewStatus ? 'Proponi un altro orario' : 'Proponi un colloquio'}
                                    </button>
                                )}
                            </div>
                            {row.interviewStatus && row.interviewDate ? (
                                <div className="mt-2 text-sm text-slate-700 space-y-1">
                                    <p className="flex flex-wrap items-center gap-2">
                                        <span className="font-semibold text-abisso first-letter:uppercase">{formatDate(row.interviewDate, 'weekday')}, ore {row.interviewTime}</span>
                                        {chip && <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${chip.cls}`}>{chip.text}</span>}
                                    </p>
                                    <p className="break-words">{row.interviewMode ? MODE_LABEL[row.interviewMode] : ''}{row.interviewPlace ? ` · ${row.interviewPlace}` : ''}</p>
                                    {row.interviewStatus === 'reschedule' && row.interviewReply && <p className="text-amber-900">Risposta: «{row.interviewReply}»</p>}
                                </div>
                            ) : (
                                <p className="mt-1 text-sm text-slate-500">Scegli data, ora e luogo: {name} riceve una notifica e conferma con un tocco.</p>
                            )}
                        </div>
                    )}
                    <InternalReview applicationId={row.$id} review={review} onSaved={onReview} />
                    {contact?.allowed && (contact.phone || contact.email) && (
                        <p className="text-sm flex flex-wrap gap-x-4 gap-y-1">
                            {contact.phone && <a href={`tel:${contact.phone.replace(/\s/g, '')}`} className="py-1 -my-1 inline-flex items-center gap-1.5 text-corsia-700 font-semibold hover:underline"><Icon type="phone" className="w-4 h-4" />{contact.phone}</a>}
                            {contact.email && <a href={`mailto:${contact.email}`} className="py-1 -my-1 inline-flex items-center gap-1.5 text-corsia-700 font-semibold hover:underline"><Icon type="mail" className="w-4 h-4" />{contact.email}</a>}
                        </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                        {row.status !== 'hired' && row.status !== 'rejected' && (
                            <button disabled={busy} onClick={onHire} className="px-4 py-2 rounded-full text-sm font-semibold bg-abisso text-white hover:bg-corsia-900 disabled:opacity-60">Assumi</button>
                        )}
                        {(row.status === 'pending' || row.status === 'reviewed') && (
                            <button disabled={busy} onClick={() => onStatus('accepted')} className="px-4 py-2 rounded-full text-sm font-semibold bg-cloro-100 text-cloro-800 hover:bg-cloro-200 disabled:opacity-60">Seleziona per un colloquio</button>
                        )}
                        <Link to={`/messages?u=${encodeURIComponent(row.applicantId)}`} className="px-4 py-2 rounded-full text-sm font-semibold bg-white border border-slate-200 text-abisso hover:border-slate-300 inline-flex items-center gap-1.5">
                            <Icon type="chat-bubble" className="w-4 h-4" /> Scrivi
                        </Link>
                        <Link to={`/profile/${row.applicantId}`} className="px-4 py-2 rounded-full text-sm font-semibold bg-white border border-slate-200 text-abisso hover:border-slate-300">Profilo completo</Link>
                        {row.status !== 'hired' && row.status !== 'rejected' && (
                            <button disabled={busy} onClick={() => onStatus('rejected')} className="px-4 py-2 rounded-full text-sm font-semibold text-slate-600 hover:text-galleggiante-700 hover:bg-red-50 disabled:opacity-60">Scarta</button>
                        )}
                        {row.status === 'rejected' && (
                            <button disabled={busy} onClick={() => onStatus('reviewed')} className="px-4 py-2 rounded-full text-sm font-semibold bg-white border border-slate-200 text-abisso hover:border-slate-300 disabled:opacity-60">Rimetti in valutazione</button>
                        )}
                        {row.status === 'hired' && (
                            <Link to={`/profile/${job.structureId}?area=staff`} className="px-4 py-2 rounded-full text-sm font-semibold bg-cloro-100 text-cloro-800 hover:bg-cloro-200">Vai all’area staff</Link>
                        )}
                    </div>
                </div>
            )}
        </li>
    );
};

/** Valutazione e nota interne: le vede solo chi gestisce l'annuncio, mai il candidato. */
const InternalReview: React.FC<{ applicationId: string; review?: ApplicationReview; onSaved: (r: ApplicationReview) => void }> = ({ applicationId, review, onSaved }) => {
    const { showToast } = useToast();
    const [rating, setRating] = useState(review?.rating || 0);
    const [note, setNote] = useState(review?.note || '');
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        setRating(review?.rating || 0);
        setNote(review?.note || '');
    }, [review?.rating, review?.note]);
    const dirty = rating !== (review?.rating || 0) || note.trim() !== (review?.note || '');

    const save = async (nextRating = rating) => {
        setSaving(true);
        try {
            const saved = await databaseService.saveApplicationReview(applicationId, nextRating, note.trim());
            onSaved(saved);
            showToast('Valutazione salvata.', 'success');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Valutazione non salvata.', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="rounded-2xl bg-white border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-abisso">Valutazione interna</h3>
                <span className="text-xs text-slate-500 inline-flex items-center gap-1"><Icon type="lock-closed" className="w-3.5 h-3.5" />Visibile solo a chi gestisce l’annuncio</span>
            </div>
            <div className="mt-2">
                <StarRating value={rating} onChange={setRating} label="Valutazione interna" />
            </div>
            <label htmlFor={`note-${applicationId}`} className="sr-only">Nota interna</label>
            <textarea
                id={`note-${applicationId}`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Es. Ottima prova in acqua, disponibile solo nei weekend."
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-abisso placeholder:text-slate-400 outline-none focus:border-corsia-500 focus:ring-4 focus:ring-corsia-100 resize-y"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-500">{review?.updatedAt ? `Aggiornata ${formatRelativeTime(review.updatedAt)}` : 'Nessuna valutazione ancora.'}</p>
                <button type="button" disabled={!dirty || saving} onClick={() => void save()} className="px-4 py-2 rounded-full text-sm font-semibold bg-corsia-600 text-white hover:bg-corsia-700 disabled:opacity-50">
                    {saving ? 'Salvataggio…' : 'Salva la valutazione'}
                </button>
            </div>
        </div>
    );
};
