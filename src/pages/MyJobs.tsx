import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useSignal } from '@/hooks/useSignal';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/context/ToastContext';
import { databaseService, type ManagedJob } from '@/services/database';
import { Icon } from '@/components/ui/Icon';
import { PageLoader } from '@/components/common/PageLoader';
import { Select } from '@/components/form/Pickers';
import { PremiumBadge } from '@/features/premium/PremiumBadge';
import { CreateJobModal } from '@/features/jobs/components/CreateJobModal';
import { CreateSOSModal } from '@/features/jobs/components/CreateSOSModal';
import { useManagedStructures } from '@/features/jobs/useManagedStructures';
import { isJobOpen, jobDisplayTitle, jobExpiryLabel } from '@/utils/jobs';
import { isPremium } from '@/utils/premium';
import { jobRoleLabel } from '@/data/swimming';
import { formatDate } from '@/utils/dates';
import { formatRelativeTime } from '@/utils/format';

/** Annunci attivi contemporaneamente con il piano Base (verificato dal server: BASE_ACTIVE_JOBS). */
const BASE_ACTIVE_JOBS = 2;

/**
 * I miei annunci (/jobs/annunci): il gestionale degli annunci di una struttura.
 * Attivi e conclusi, candidature nuove da guardare, modifica, chiusura, ripubblicazione.
 */
const MyJobs: React.FC = () => {
    usePageTitle('I miei annunci');
    const { user } = useAuth();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const managed = useManagedStructures();
    const [params, setParams] = useSearchParams();
    const [jobs, setJobs] = useState<ManagedJob[] | null>(null);
    const [creating, setCreating] = useState(false);
    const [sosOpen, setSosOpen] = useState(false);
    const [editing, setEditing] = useState<ManagedJob | null>(null);
    const [template, setTemplate] = useState<ManagedJob | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    const structureId = params.get('struttura') && managed?.some((m) => m.id === params.get('struttura')) ? params.get('struttura')! : managed?.[0]?.id || '';
    const tab = params.get('vista') === 'conclusi' ? 'conclusi' : 'attivi';
    const setParam = (k: string, v: string) => {
        const next = new URLSearchParams(params);
        next.set(k, v);
        setParams(next, { replace: true });
    };

    const load = useCallback(async () => {
        if (!structureId) return;
        try {
            setJobs(await databaseService.listStructureJobs(structureId));
        } catch (err) {
            console.error('I miei annunci:', err);
            showToast(err instanceof Error ? err.message : 'Non è stato possibile caricare gli annunci.', 'error');
            setJobs([]);
        }
    }, [structureId, showToast]);

    useEffect(() => {
        setJobs(null);
        void load();
    }, [load]);

    // Tempo reale: nuove candidature, ritiri e modifiche agli annunci aggiornano i conteggi.
    useSignal(structureId ? 'job:*' : null, () => void load(), 400);

    const active = useMemo(() => (jobs || []).filter((j) => isJobOpen(j)), [jobs]);
    const ended = useMemo(() => (jobs || []).filter((j) => !isJobOpen(j)), [jobs]);
    const totals = useMemo(
        () => active.reduce((t, j) => ({ fresh: t.fresh + j.applications.pending, selected: t.selected + j.applications.accepted, total: t.total + j.applications.total }), { fresh: 0, selected: 0, total: 0 }),
        [active]
    );
    const hired = (jobs || []).reduce((n, j) => n + j.applications.hired, 0);

    if (managed === null) return <PageLoader />;
    if (!managed.length) {
        return (
            <div className="max-w-lg mx-auto text-center py-20">
                <Icon type="briefcase" className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                <h1 className="text-3xl font-bold text-abisso">Annunci delle strutture</h1>
                <p className="text-slate-500 mt-2">Questa pagina è per le piscine e per chi amministra la pagina di una struttura.</p>
                <Link to="/jobs" className="inline-block mt-6 px-5 py-2.5 rounded-full font-semibold bg-abisso text-white hover:bg-corsia-900">Vai alle offerte</Link>
            </div>
        );
    }

    const current = managed.find((m) => m.id === structureId)!;
    // Il limite del piano Base vale per chi pubblica (verificato dal server).
    const premium = isPremium(user);
    const activeRegular = active.filter((j) => !j.isSOS).length;
    const shown = tab === 'attivi' ? active : ended;

    const toggle = async (job: ManagedJob) => {
        // Chiudere si annulla dal toast: niente conferma prima.
        setBusy(job.$id);
        try {
            const saved = job.isActive ? await databaseService.closeJob(job.$id) : await databaseService.reopenJob(job.$id);
            setJobs((prev) => (prev || []).map((j) => (j.$id === job.$id ? { ...j, isActive: saved.isActive } : j)));
            if (saved.isActive) showToast('Annuncio riaperto.', 'success');
            else showToast('Annuncio chiuso: lo trovi tra i conclusi.', 'success', { action: { label: 'Annulla', onClick: () => void toggle({ ...job, isActive: false }) } });
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Operazione non riuscita.', 'error');
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="pt-4 pb-10 max-w-5xl mx-auto w-full">
            <Link to="/jobs" className="py-1 -my-1 inline-flex items-center gap-1.5 text-sm font-semibold text-corsia-700 hover:text-corsia-900">
                <Icon type="arrow-left" className="w-4 h-4" /> Lavoro
            </Link>
            <div className="mt-3 flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="min-w-0">
                    <h1 className="text-4xl font-bold text-abisso leading-none">I miei annunci</h1>
                    {managed.length > 1 ? (
                        <div className="mt-3 w-full sm:w-80">
                            <Select label="Struttura" value={structureId} onChange={(v) => setParam('struttura', v)} options={managed.map((m) => ({ value: m.id, label: m.name, hint: m.city }))} />
                        </div>
                    ) : (
                        <p className="text-slate-600 mt-2">{current.name}</p>
                    )}
                </div>
                <div className="flex flex-wrap gap-2">
                    <Link to="/talenti" className="px-4 py-2.5 rounded-full text-sm font-semibold bg-white border border-slate-200 text-abisso hover:border-slate-300 inline-flex items-center gap-1.5">
                        <Icon type="search" className="w-4 h-4" /> Cerca personale
                    </Link>
                    {user?.$id === structureId && (
                        <button onClick={() => setSosOpen(true)} className="px-4 py-2.5 rounded-full text-sm font-semibold bg-white border border-red-200 text-galleggiante-700 hover:bg-red-50 inline-flex items-center gap-1.5">
                            <Icon type="alert-triangle" className="w-4 h-4" /> Sostituzione urgente
                        </button>
                    )}
                    <button onClick={() => setCreating(true)} className="px-4 py-2.5 rounded-full text-sm font-semibold bg-abisso text-white hover:bg-corsia-900 inline-flex items-center gap-1.5">
                        <Icon type="plus" className="w-4 h-4" /> Pubblica annuncio
                    </button>
                </div>
            </div>

            <dl className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                    { label: 'Annunci attivi', value: active.length, hint: !premium ? `${activeRegular} di ${BASE_ACTIVE_JOBS} con il piano Base` : 'Senza limiti con Premium' },
                    { label: 'Candidature nuove', value: totals.fresh, hint: totals.fresh ? 'Da guardare' : 'Tutte viste' },
                    { label: 'Selezionati', value: totals.selected, hint: 'Per un colloquio' },
                    { label: 'Assunti', value: hired, hint: 'Entrati nello staff' },
                ].map((m) => (
                    <div key={m.label} className="bg-white rounded-2xl border border-slate-200 shadow-card px-4 py-3">
                        <dt className="text-sm text-slate-500">{m.label}</dt>
                        <dd className="font-display text-4xl font-bold text-abisso leading-tight">{jobs ? m.value : '–'}</dd>
                        <dd className="text-xs text-slate-500">{m.hint}</dd>
                    </div>
                ))}
            </dl>
            {!premium && activeRegular >= BASE_ACTIVE_JOBS && (
                <p className="mt-3 rounded-2xl bg-oro-50 border border-oro-200 px-4 py-3 text-sm text-slate-800 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <PremiumBadge /> Hai raggiunto i {BASE_ACTIVE_JOBS} annunci attivi del piano Base: chiudine uno per pubblicarne un altro, oppure
                    <Link to="/premium" className="font-semibold text-oro-700 hover:underline py-1 -my-1">passa a Premium</Link> per annunci senza limiti e in evidenza.
                </p>
            )}

            <div className="mt-6 flex gap-2 border-b border-slate-200" role="tablist" aria-label="Annunci">
                {(['attivi', 'conclusi'] as const).map((t) => (
                    <button
                        key={t}
                        role="tab"
                        aria-selected={tab === t}
                        onClick={() => setParam('vista', t)}
                        className={`px-3 py-3 -mb-px border-b-2 text-sm font-semibold ${tab === t ? 'border-corsia-600 text-corsia-800' : 'border-transparent text-slate-500 hover:text-abisso'}`}
                    >
                        {t === 'attivi' ? 'Attivi' : 'Chiusi e scaduti'} <span className="tabular-nums ml-1 text-xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">{t === 'attivi' ? active.length : ended.length}</span>
                    </button>
                ))}
            </div>

            {jobs === null ? (
                <div className="mt-4 space-y-3" aria-hidden="true">{[0, 1, 2].map((i) => <div key={i} className="h-28 bg-white rounded-2xl border border-slate-200 animate-pulse" />)}</div>
            ) : shown.length === 0 ? (
                <div className="mt-4 bg-white border border-dashed border-slate-300 rounded-3xl p-10 text-center">
                    <Icon type="briefcase" className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                    <h2 className="text-xl font-semibold text-abisso">{tab === 'attivi' ? 'Nessun annuncio attivo' : 'Nessun annuncio concluso'}</h2>
                    <p className="text-slate-500 mt-1">{tab === 'attivi' ? 'Pubblica un annuncio: chi ha un avviso di lavoro adatto riceve subito una notifica.' : 'Qui finiscono gli annunci chiusi o scaduti, pronti da ripubblicare.'}</p>
                    {tab === 'attivi' && <button onClick={() => setCreating(true)} className="mt-5 px-5 py-2.5 rounded-full text-sm font-semibold bg-abisso text-white hover:bg-corsia-900">Pubblica annuncio</button>}
                </div>
            ) : (
                <ul className="mt-4 space-y-3">
                    {shown.map((job) => {
                        const c = job.applications;
                        const open = isJobOpen(job);
                        const expired = !!job.expiresAt && job.expiresAt < new Date().toISOString().slice(0, 10);
                        return (
                            <li key={job.$id} className="bg-white rounded-2xl border border-slate-200 shadow-card p-5">
                                <div className="flex flex-col sm:flex-row sm:items-start gap-3 justify-between">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2 text-xs">
                                            {job.isSOS && <span className="font-semibold text-galleggiante-700 bg-red-50 rounded-full px-2 py-0.5">SOS · {formatDate(job.sosDate, 'weekday')}</span>}
                                            {job.featured && open && <span className="inline-flex items-center gap-1 font-semibold text-oro-700"><PremiumBadge /> In evidenza</span>}
                                            {!open && <span className="font-semibold text-slate-600 bg-slate-100 rounded-full px-2 py-0.5">{expired ? 'Scaduto' : 'Chiuso'}</span>}
                                            {open && !job.isSOS && jobExpiryLabel(job) && <span className="font-semibold text-amber-800">{jobExpiryLabel(job)}</span>}
                                        </div>
                                        <h2 className="mt-1 text-lg font-semibold text-abisso leading-snug">
                                            <Link to={`/jobs/${job.$id}`} className="hover:underline">{jobDisplayTitle(job)}</Link>
                                        </h2>
                                        <p className="text-sm text-slate-500">
                                            {[jobRoleLabel(job.role), job.city, `pubblicato ${formatRelativeTime(job.$createdAt)}`, open && job.expiresAt && !job.isSOS ? `fino al ${formatDate(job.expiresAt, 'short')}` : ''].filter(Boolean).join(' · ')}
                                        </p>
                                    </div>
                                    <Link
                                        to={`/jobs/${job.$id}?candidati=${c.pending ? 'nuove' : c.accepted ? 'selezionate' : 'valutazione'}#candidati`}
                                        className="shrink-0 self-start px-4 py-2 rounded-full text-sm font-semibold bg-corsia-50 text-corsia-800 hover:bg-corsia-100 inline-flex items-center gap-2"
                                    >
                                        {c.total === 1 ? '1 candidatura' : `${c.total} candidature`}
                                        {c.pending > 0 && <span className="tabular-nums text-xs px-1.5 py-0.5 rounded-full bg-corsia-600 text-white">{c.pending} {c.pending === 1 ? 'nuova' : 'nuove'}</span>}
                                    </Link>
                                </div>
                                {c.total > 0 && (
                                    <p className="mt-3 text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
                                        <span>Viste {c.reviewed}</span><span>Selezionate {c.accepted}</span><span>Assunte {c.hired}</span><span>Scartate {c.rejected}</span>
                                    </p>
                                )}
                                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                                    {!job.isSOS && <button onClick={() => setEditing(job)} className="py-1 -my-1 font-semibold text-corsia-700 hover:underline">Modifica</button>}
                                    {!job.isSOS && !expired && (
                                        <button onClick={() => toggle(job)} disabled={busy === job.$id} className="py-1 -my-1 font-semibold text-corsia-700 hover:underline disabled:opacity-60">{job.isActive ? 'Chiudi' : 'Riapri'}</button>
                                    )}
                                    {!job.isSOS && <button onClick={() => setTemplate(job)} className="py-1 -my-1 font-semibold text-corsia-700 hover:underline">Ripubblica</button>}
                                    <Link to={`/jobs/${job.$id}`} className="py-1 -my-1 font-semibold text-corsia-700 hover:underline">Apri l’annuncio</Link>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            <CreateJobModal isOpen={creating} onClose={() => setCreating(false)} structureId={structureId} onJobCreated={() => void load()} />
            <CreateJobModal isOpen={!!editing} onClose={() => setEditing(null)} structureId={structureId} job={editing} onJobCreated={() => void load()} />
            <CreateJobModal isOpen={!!template} onClose={() => setTemplate(null)} structureId={structureId} template={template} onJobCreated={(j) => (j ? navigate(`/jobs/${j.$id}`) : void load())} />
            {user?.$id === structureId && <CreateSOSModal isOpen={sosOpen} onClose={() => setSosOpen(false)} onCreated={() => void load()} structureId={structureId} />}
        </div>
    );
};

export default MyJobs;
