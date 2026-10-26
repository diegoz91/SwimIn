import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { JobCard } from './JobCard';
import { Icon } from '@/components/ui/Icon';
import { CreateSOSModal } from './CreateSOSModal';
import { JobAlertsModal } from './JobAlertsModal';
import { Select } from '@/components/form/Pickers';
import { JOB_ROLES, contractLabel } from '@/data/swimming';
import { databaseService } from '@/services/database';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/context/ToastContext';
import { jobDisplayTitle } from '@/utils/jobs';
import { formatDate } from '@/utils/dates';
import type { Job } from '@/types/types';
import type { useApplyFlow } from '../useApplyFlow';

interface LavoroViewProps {
    apply: ReturnType<typeof useApplyFlow>;
    /** Gestisce annunci (profilo Struttura o amministratore di una pagina). */
    isManager: boolean;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Bacheca lavoro: sostituzioni urgenti in cima, poi le offerte (in evidenza prima), con filtri. */
export const LavoroView: React.FC<LavoroViewProps> = ({ apply, isManager }) => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [jobs, setJobs] = useState<Job[] | null>(null);
    const [sosOpen, setSosOpen] = useState(false);
    const [alertsOpen, setAlertsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [role, setRole] = useState('');
    const [contract, setContract] = useState('');
    const [nearMe, setNearMe] = useState(false);
    const [sortBy, setSortBy] = useState<'recent' | 'salary'>('recent');

    const isStructure = user?.userType === 'structure';
    const isProfessional = user?.userType === 'professional';

    const load = async () => {
        try {
            setJobs(await databaseService.getActiveJobs());
        } catch (err) {
            console.error('Offerte:', err);
            showToast('Non è stato possibile caricare le offerte.', 'error');
            setJobs([]);
        }
    };
    useEffect(() => {
        void load();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const contracts = useMemo(() => [...new Set((jobs || []).map((j) => j.contractType).filter((c): c is string => !!c))].sort(), [jobs]);
    const myCity = norm(user?.city || '');
    const myProvince = (user?.province || '').toUpperCase();
    const canNearMe = !!(myCity || myProvince);

    const filtered = useMemo(() => {
        const q = norm(query.trim());
        const list = (jobs || []).filter((j) => {
            const text = norm(`${j.title} ${j.role} ${j.city} ${j.structureName || ''} ${j.description || ''}`);
            return (
                (!q || q.split(/\s+/).every((w) => text.includes(w))) &&
                (!role || j.role === role) &&
                (!contract || j.contractType === contract) &&
                (!nearMe || (myCity && norm(j.city) === myCity) || (myProvince && (j.province || '').toUpperCase() === myProvince))
            );
        });
        return sortBy === 'salary' ? [...list].sort((a, b) => (b.salaryMax || b.salaryMin || 0) - (a.salaryMax || a.salaryMin || 0)) : list;
    }, [jobs, query, role, contract, nearMe, myCity, myProvince, sortBy]);

    const filtersOn = !!query || !!role || !!contract || nearMe;
    const reset = () => { setQuery(''); setRole(''); setContract(''); setNearMe(false); };
    const sos = filtered.filter((j) => j.isSOS);
    // Annunci delle strutture Premium in cima (a parità, l'ordine resta quello scelto).
    const regular = filtered.filter((j) => !j.isSOS).sort((a, b) => Number(!!b.featured) - Number(!!a.featured));

    return (
        <div className="max-w-5xl mx-auto w-full pb-10">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-4xl font-bold text-abisso leading-none">Lavoro</h1>
                    <p className="text-slate-600 mt-2">{isManager ? 'Le offerte delle piscine e i tuoi annunci.' : 'Le opportunità nelle piscine, con le sostituzioni urgenti in cima.'}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {isProfessional && apply.canApply && (
                        <>
                            <button onClick={() => setAlertsOpen(true)} className="px-4 py-2.5 rounded-full text-sm font-semibold bg-white border border-slate-200 text-abisso hover:border-slate-300 inline-flex items-center gap-1.5">
                                <Icon type="bell" className="w-4 h-4" /> Avvisi
                            </button>
                            <Link to="/jobs/candidature" className="px-4 py-2.5 rounded-full text-sm font-semibold bg-white border border-slate-200 text-abisso hover:border-slate-300 inline-flex items-center gap-1.5">
                                Le mie candidature
                                {!!apply.applications?.length && <span className="tabular-nums text-xs px-1.5 py-0.5 rounded-full bg-piastrella text-slate-700">{apply.applications.length}</span>}
                            </Link>
                        </>
                    )}
                    {isManager && (
                        <>
                            <Link to="/talenti" className="px-4 py-2.5 rounded-full text-sm font-semibold bg-white border border-slate-200 text-abisso hover:border-slate-300 inline-flex items-center gap-1.5">
                                <Icon type="search" className="w-4 h-4" /> Cerca personale
                            </Link>
                            <Link to="/jobs/annunci" className="px-4 py-2.5 rounded-full text-sm font-semibold bg-abisso text-white hover:bg-corsia-900 inline-flex items-center gap-1.5">
                                <Icon type="briefcase" className="w-4 h-4" /> I miei annunci
                            </Link>
                        </>
                    )}
                </div>
            </div>

            {isStructure && (
                <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                    <div className="flex items-start gap-3">
                        <span className="w-10 h-10 rounded-full bg-galleggiante text-white grid place-items-center flex-shrink-0" aria-hidden="true"><Icon type="alert-triangle" className="w-5 h-5" /></span>
                        <div>
                            <h2 className="font-semibold text-abisso">Turno scoperto all’ultimo momento?</h2>
                            <p className="text-sm text-slate-700">Lancia una sostituzione urgente: avvisiamo subito i professionisti disponibili in zona.</p>
                        </div>
                    </div>
                    <button onClick={() => setSosOpen(true)} className="px-5 py-2.5 rounded-full text-sm font-semibold bg-galleggiante text-white hover:bg-red-700 flex-shrink-0">Richiedi una sostituzione</button>
                </div>
            )}

            <div className="bg-white rounded-2xl border border-slate-200 flex items-center px-4 focus-within:border-corsia-400 focus-within:ring-4 focus-within:ring-corsia-100">
                <Icon type="search" className="w-5 h-5 text-slate-400" />
                <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Ruolo, brevetto, piscina o città"
                    aria-label="Cerca offerte di lavoro"
                    className="flex-1 min-w-0 py-3.5 px-3 bg-transparent outline-none text-abisso placeholder:text-slate-400"
                />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
                <div className="w-48"><Select size="sm" label="Ruolo" value={role} onChange={setRole} placeholder="Tutti i ruoli" clearLabel="Tutti i ruoli" options={JOB_ROLES} /></div>
                {contracts.length > 0 && <div className="w-44"><Select size="sm" label="Contratto" value={contract} onChange={setContract} placeholder="Tutti i contratti" clearLabel="Tutti i contratti" options={contracts.map((c) => ({ value: c, label: contractLabel(c) }))} /></div>}
                <button
                    onClick={() => setNearMe((v) => !v)}
                    disabled={!canNearMe}
                    aria-pressed={nearMe}
                    title={canNearMe ? 'Solo offerte nella tua città o provincia' : 'Aggiungi la tua città al profilo per usare questo filtro'}
                    className={`px-3 py-2 rounded-xl border text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 ${nearMe ? 'bg-abisso border-abisso text-white' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'}`}
                >
                    <Icon type="location" className="w-4 h-4" /> Nella mia zona
                </button>
                <div className="ml-auto w-48"><Select size="sm" label="Ordina offerte" value={sortBy} onChange={(v) => setSortBy(v as 'recent' | 'salary')} options={[{ value: 'recent', label: 'Più recenti' }, { value: 'salary', label: 'Compenso più alto' }]} /></div>
            </div>
            {jobs && (
                <p className="mt-3 text-sm text-slate-500" aria-live="polite">
                    {filtered.length === 1 ? '1 offerta' : `${filtered.length} offerte`}
                    {filtersOn && <> · <button onClick={reset} className="py-1 -my-1 font-semibold text-corsia-700 hover:underline">azzera filtri</button></>}
                    {filtersOn && apply.canApply && <> · <button onClick={() => setAlertsOpen(true)} className="py-1 -my-1 font-semibold text-corsia-700 hover:underline">avvisami per questa ricerca</button></>}
                </p>
            )}

            <div className="mt-6">
                {jobs === null ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" aria-hidden="true">
                        {[0, 1, 2, 3, 4, 5].map((n) => <div key={n} className="h-52 bg-white rounded-2xl border border-slate-200 animate-pulse" />)}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="bg-white border border-dashed border-slate-300 rounded-3xl p-10 text-center">
                        <Icon type="briefcase" className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                        <h2 className="text-xl font-semibold text-abisso">{filtersOn ? 'Nessuna offerta con questi filtri' : 'Nessuna offerta attiva in questo momento'}</h2>
                        <p className="text-slate-500 mt-1 max-w-md mx-auto">{filtersOn ? 'Allarga la ricerca o salva un avviso: ti scriviamo appena esce un annuncio adatto.' : 'Salva un avviso e ti scriviamo appena una piscina pubblica un annuncio.'}</p>
                        <div className="mt-5 flex flex-wrap justify-center gap-2">
                            {filtersOn && <button onClick={reset} className="px-4 py-2 rounded-full text-sm font-semibold bg-white border border-slate-200 text-abisso">Azzera filtri</button>}
                            {apply.canApply && <button onClick={() => setAlertsOpen(true)} className="px-4 py-2 rounded-full text-sm font-semibold bg-corsia-600 text-white hover:bg-corsia-700">Crea un avviso</button>}
                        </div>
                    </div>
                ) : (
                    <>
                        {sos.length > 0 && (
                            <section className="mb-8" aria-labelledby="sos-title">
                                <h2 id="sos-title" className="text-2xl font-bold text-galleggiante-700 flex items-center gap-2 mb-3">
                                    <Icon type="alert-triangle" className="w-6 h-6" /> Sostituzioni urgenti
                                </h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {sos.map((job) => {
                                        const applied = !!apply.applicationFor(job.$id);
                                        return (
                                            <article key={job.$id} className="bg-white border-2 border-red-200 rounded-2xl p-5 flex flex-col">
                                                <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-galleggiante-700"><span className="w-2 h-2 rounded-full bg-galleggiante motion-safe:animate-pulse" aria-hidden="true" /> SOS attivo</p>
                                                <h3 className="mt-1 text-lg font-semibold text-abisso leading-snug line-clamp-2">
                                                    <Link to={`/jobs/${job.$id}`} className="hover:underline">{jobDisplayTitle(job)}</Link>
                                                </h3>
                                                <p className="text-sm text-slate-600 truncate">{job.structureName || 'Struttura'} · {job.city}</p>
                                                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                                                    <div className="rounded-xl bg-red-50 px-3 py-2"><dt className="text-xs text-slate-600">Quando</dt><dd className="font-semibold text-abisso">{formatDate(job.sosDate, 'weekday')}</dd></div>
                                                    <div className="rounded-xl bg-red-50 px-3 py-2"><dt className="text-xs text-slate-600">Turno</dt><dd className="font-semibold text-abisso">{job.sosShift || 'Da concordare'}</dd></div>
                                                    {!!job.salaryMin && <div className="col-span-2 rounded-xl bg-red-50 px-3 py-2"><dt className="text-xs text-slate-600">Compenso</dt><dd className="font-semibold text-abisso">{job.salaryMin} €</dd></div>}
                                                </dl>
                                                <div className="mt-4">
                                                    {applied ? (
                                                        <span className="w-full justify-center px-4 py-2.5 rounded-full text-sm font-semibold bg-cloro-50 text-cloro-800 border border-cloro-200 inline-flex items-center gap-1.5"><Icon type="check" className="w-4 h-4" /> Ti sei proposto</span>
                                                    ) : apply.canApply ? (
                                                        <button onClick={() => apply.start(job)} className="w-full px-4 py-2.5 rounded-full text-sm font-semibold bg-galleggiante text-white hover:bg-red-700">Mi propongo</button>
                                                    ) : (
                                                        <Link to={`/jobs/${job.$id}`} className="w-full block text-center px-4 py-2.5 rounded-full text-sm font-semibold bg-white border border-slate-200 text-abisso">Dettagli</Link>
                                                    )}
                                                </div>
                                            </article>
                                        );
                                    })}
                                </div>
                            </section>
                        )}
                        {regular.length > 0 && (
                            <section aria-labelledby="all-jobs-title">
                                <h2 id="all-jobs-title" className={sos.length ? 'text-2xl font-bold text-abisso mb-3' : 'sr-only'}>Tutte le offerte</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {regular.map((job) => (
                                        <JobCard key={job.$id} job={job} canApply={apply.canApply} applied={!!apply.applicationFor(job.$id)} onApply={apply.start} />
                                    ))}
                                </div>
                            </section>
                        )}
                    </>
                )}
            </div>

            {isStructure && user && <CreateSOSModal isOpen={sosOpen} onClose={() => setSosOpen(false)} onCreated={load} structureId={user.$id} />}
            <JobAlertsModal
                open={alertsOpen}
                onClose={() => setAlertsOpen(false)}
                initial={{ query: query.trim(), province: nearMe ? myProvince : '', contractType: contract }}
            />
        </div>
    );
};
