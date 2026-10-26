import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/context/ToastContext';
import { useSaved } from '@/context/SavedContext';
import { databaseService } from '@/services/database';
import { Icon } from '@/components/ui/Icon';
import { PageLoader } from '@/components/common/PageLoader';
import { PremiumBadge } from '@/features/premium/PremiumBadge';
import { CandidatesPanel } from '@/features/jobs/components/CandidatesPanel';
import { CreateJobModal } from '@/features/jobs/components/CreateJobModal';
import { useApplyFlow } from '@/features/jobs/useApplyFlow';
import { useManagedStructures } from '@/features/jobs/useManagedStructures';
import { STATUS, candidateHint, candidateSteps } from '@/features/jobs/applicationStatus';
import { contractLabel, jobRoleLabel } from '@/data/swimming';
import { isJobOpen, jobDisplayTitle, jobExpiryLabel } from '@/utils/jobs';
import { swimMatchScore } from '@/utils/swimMatch';
import { initialsAvatar } from '@/utils/avatar';
import { formatDate } from '@/utils/dates';
import { formatRelativeTime } from '@/utils/format';
import type { Job, UserProfile } from '@/types/types';
import { useConfirm } from '@/context/ConfirmContext';

const salaryOf = (j: Job) =>
    j.salaryMin && j.salaryMax ? `${j.salaryMin.toLocaleString('it-IT')}–${j.salaryMax.toLocaleString('it-IT')} € al mese` : j.salaryMin ? `Da ${j.salaryMin.toLocaleString('it-IT')} €${j.isSOS ? '' : ' al mese'}` : j.salaryMax ? `Fino a ${j.salaryMax.toLocaleString('it-IT')} € al mese` : '';

/** Pagina di un annuncio (/jobs/:id): per chi cerca lavoro dettagli e candidatura, per chi lo gestisce anche i candidati. */
const JobPage: React.FC = () => {
    const confirm = useConfirm();
    const { id = '' } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { showToast } = useToast();
    const { isSaved, toggle: toggleSaved } = useSaved();
    const managed = useManagedStructures();
    const apply = useApplyFlow();
    const [job, setJob] = useState<Job | null | undefined>(undefined);
    const [editing, setEditing] = useState(false);
    const [reposting, setReposting] = useState(false);
    const [busy, setBusy] = useState(false);
    usePageTitle(job ? jobDisplayTitle(job) : 'Offerta di lavoro');

    const load = useCallback(async () => {
        try {
            setJob(await databaseService.getJob(id));
        } catch (err) {
            console.error('Annuncio:', err);
            setJob(null);
        }
    }, [id]);

    useEffect(() => {
        setJob(undefined);
        void load();
    }, [load]);

    const isManager = !!job && (managed || []).some((s) => s.id === job.structureId);
    const application = job ? apply.applicationFor(job.$id) : null;
    const open = job ? isJobOpen(job) : false;
    const expired = !!job?.expiresAt && job.expiresAt < new Date().toISOString().slice(0, 10);

    const requirements = useMemo(() => {
        if (!job || !user || user.userType !== 'professional') return null;
        const all = [...(job.requirements || []), ...(job.qualificationsRequired || [])];
        if (!all.length) return null;
        // Ogni requisito confrontato da solo con il profilo: soddisfatto o no.
        return all.map((r) => ({ label: r, met: swimMatchScore(user as UserProfile, { requirements: [r], qualificationsRequired: [] }) === 100 }));
    }, [job, user]);

    if (job === undefined || managed === null) return <PageLoader />;
    if (!job) {
        return (
            <div className="max-w-lg mx-auto text-center py-20">
                <Icon type="briefcase" className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                <h1 className="text-3xl font-bold text-abisso">Offerta non trovata</h1>
                <p className="text-slate-500 mt-2">L’annuncio è stato rimosso o il link non è corretto.</p>
                <Link to="/jobs" className="inline-block mt-6 px-5 py-2.5 rounded-full font-semibold bg-abisso text-white hover:bg-corsia-900">Vai alla bacheca lavoro</Link>
            </div>
        );
    }

    const title = jobDisplayTitle(job);
    const logo = job.facilityLogo || initialsAvatar(job.structureName || 'Struttura');
    const salary = salaryOf(job);
    const facts = [
        job.role && { icon: 'user' as const, text: jobRoleLabel(job.role) },
        job.contractType && { icon: 'briefcase' as const, text: contractLabel(job.contractType) },
        { icon: 'location' as const, text: `${job.city}${job.province ? ` (${job.province})` : ''}` },
        job.workingHours && { icon: 'clock' as const, text: job.workingHours },
    ].filter(Boolean) as { icon: 'user' | 'briefcase' | 'location' | 'clock'; text: string }[];

    const share = async () => {
        const url = `${window.location.origin}/offerte/${job.$id}`;
        try {
            if (navigator.share) await navigator.share({ title, url });
            else {
                await navigator.clipboard.writeText(url);
                showToast('Link dell’offerta copiato: si apre anche senza account.', 'success');
            }
        } catch (err) {
            if ((err as Error)?.name !== 'AbortError') console.warn('Condivisione:', err);
        }
    };

    const toggleOpen = async () => {
        if (job.isActive && !(await confirm({ title: 'Chiudere l’annuncio?', message: 'Non riceverà più candidature; potrai riaprirlo finché non scade.', confirmLabel: 'Chiudi l’annuncio' }))) return;
        setBusy(true);
        try {
            const saved = job.isActive ? await databaseService.closeJob(job.$id) : await databaseService.reopenJob(job.$id);
            setJob({ ...job, isActive: saved.isActive });
            showToast(saved.isActive ? 'Annuncio riaperto: è di nuovo in bacheca.' : 'Annuncio chiuso.', 'success');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Operazione non riuscita.', 'error');
        } finally {
            setBusy(false);
        }
    };

    const withdraw = async () => {
        if (!application || !(await confirm({ title: 'Ritirare la candidatura?', message: 'La struttura non la vedrà più.', confirmLabel: 'Ritira', tone: 'danger' }))) return;
        try {
            await databaseService.withdrawApplication(application.$id);
            await apply.reload();
            showToast('Candidatura ritirata.', 'info');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Ritiro non riuscito.', 'error');
        }
    };

    const saved = isSaved('job', job.$id);

    return (
        <div className="pt-4 pb-6 max-w-4xl mx-auto w-full space-y-4">
            <button
                onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(isManager ? '/jobs/annunci' : '/jobs'))}
                className="py-1 -my-1 inline-flex items-center gap-1.5 text-sm font-semibold text-corsia-700 hover:text-corsia-900"
            >
                <Icon type="arrow-left" className="w-4 h-4" /> Indietro
            </button>

            <article className="bg-white rounded-3xl border border-slate-200 shadow-card overflow-hidden" aria-labelledby="job-title">
                {job.isSOS && <div className="bg-galleggiante-700 text-white text-sm font-semibold px-5 sm:px-7 py-2 flex items-center gap-2"><Icon type="alert-triangle" className="w-4 h-4" /> Sostituzione urgente · {formatDate(job.sosDate, 'weekday')}{job.sosShift ? `, ${job.sosShift}` : ''}</div>}
                <div className="p-5 sm:p-7">
                    <div className="flex items-start gap-4">
                        <img src={logo} alt="" className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover border border-slate-100 bg-white flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                            <h1 id="job-title" className="text-3xl sm:text-4xl font-bold text-abisso leading-[1.05]">{title}</h1>
                            <Link to={`/profile/${job.structureId}`} className="mt-1 inline-block py-1 -my-1 font-semibold text-slate-700 hover:text-corsia-700 hover:underline">{job.structureName || 'Struttura'}</Link>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
                                <span>Pubblicato {formatRelativeTime(job.$createdAt)}</span>
                                {job.featured && <span className="inline-flex items-center gap-1 font-semibold text-oro-700"><PremiumBadge /> In evidenza</span>}
                                {!job.isSOS && jobExpiryLabel(job) && <span className="font-semibold text-amber-800">{jobExpiryLabel(job)}</span>}
                            </div>
                        </div>
                    </div>

                    <ul className="mt-5 flex flex-wrap gap-2">
                        {facts.map((f) => (
                            <li key={f.text} className="inline-flex items-center gap-1.5 text-sm text-slate-700 bg-piastrella rounded-full px-3 py-1.5"><Icon type={f.icon} className="w-4 h-4 text-slate-500" />{f.text}</li>
                        ))}
                        {salary && <li className="inline-flex items-center gap-1.5 text-sm font-semibold text-cloro-800 bg-cloro-50 rounded-full px-3 py-1.5">{salary}</li>}
                    </ul>

                    {!open && (
                        <p className="mt-5 rounded-2xl bg-slate-100 text-slate-700 px-4 py-3 text-sm flex items-center gap-2">
                            <Icon type="lock-closed" className="w-4 h-4 flex-shrink-0" />
                            {expired ? `Annuncio scaduto il ${formatDate(job.expiresAt)}: non riceve più candidature.` : 'Annuncio chiuso: non riceve più candidature.'}
                        </p>
                    )}

                    {/* Azioni: chi gestisce l'annuncio */}
                    {isManager ? (
                        <div className="mt-5 flex flex-wrap gap-2">
                            {!job.isSOS && (
                                <button onClick={() => setEditing(true)} className="px-4 py-2.5 rounded-full text-sm font-semibold bg-abisso text-white hover:bg-corsia-900 inline-flex items-center gap-1.5">
                                    <Icon type="pencil" className="w-4 h-4" /> Modifica
                                </button>
                            )}
                            {!job.isSOS && !expired && (
                                <button onClick={toggleOpen} disabled={busy} className="px-4 py-2.5 rounded-full text-sm font-semibold bg-white border border-slate-200 text-abisso hover:border-slate-300 disabled:opacity-60 inline-flex items-center gap-1.5">
                                    <Icon type={job.isActive ? 'lock-closed' : 'check'} className="w-4 h-4" /> {job.isActive ? 'Chiudi' : 'Riapri'}
                                </button>
                            )}
                            {!job.isSOS && (
                                <button onClick={() => setReposting(true)} className="px-4 py-2.5 rounded-full text-sm font-semibold bg-white border border-slate-200 text-abisso hover:border-slate-300 inline-flex items-center gap-1.5">
                                    <Icon type="arrow-path" className="w-4 h-4" /> Ripubblica
                                </button>
                            )}
                            {open && (
                                <button onClick={share} className="px-4 py-2.5 rounded-full text-sm font-semibold bg-white border border-slate-200 text-abisso hover:border-slate-300 inline-flex items-center gap-1.5">
                                    <Icon type="share" className="w-4 h-4" /> Condividi
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="hidden sm:flex mt-5 flex-wrap gap-2">
                            <ApplyButton job={job} open={open} applied={!!application} canApply={apply.canApply} onApply={() => apply.start(job)} />
                            <button onClick={() => toggleSaved('job', job.$id)} aria-pressed={saved} className="px-4 py-2.5 rounded-full text-sm font-semibold bg-white border border-slate-200 text-abisso hover:border-slate-300 inline-flex items-center gap-1.5">
                                <Icon type="bookmark" className={`w-4 h-4 ${saved ? 'fill-corsia-200' : ''}`} /> {saved ? 'Salvata' : 'Salva'}
                            </button>
                            {open && (
                                <button onClick={share} className="px-4 py-2.5 rounded-full text-sm font-semibold bg-white border border-slate-200 text-abisso hover:border-slate-300 inline-flex items-center gap-1.5">
                                    <Icon type="share" className="w-4 h-4" /> Condividi
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </article>

            {isManager && <CandidatesPanel job={job} onHired={() => setJob({ ...job, isActive: false })} />}

            {/* La mia candidatura: il percorso a tappe */}
            {application && (
                <section className="bg-white rounded-3xl border border-slate-200 shadow-card p-5 sm:p-7" aria-labelledby="my-app-title">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h2 id="my-app-title" className="text-2xl font-bold text-abisso">La tua candidatura</h2>
                        <span className="text-sm text-slate-500">Inviata {formatRelativeTime(application.$createdAt)}</span>
                    </div>
                    <ol className="mt-4 grid gap-3 sm:grid-cols-4">
                        {candidateSteps(application.status).map((s, i) => (
                            <li key={s.label} className="flex sm:flex-col items-center sm:items-start gap-3 sm:gap-2">
                                <span
                                    className={`w-8 h-8 rounded-full grid place-items-center flex-shrink-0 text-sm font-semibold ${
                                        s.state === 'done' ? 'bg-cloro-600 text-white' : s.state === 'current' ? 'bg-corsia-600 text-white ring-4 ring-corsia-100' : s.state === 'stopped' ? 'bg-slate-500 text-white' : 'bg-slate-100 text-slate-500'
                                    }`}
                                    aria-hidden="true"
                                >
                                    {s.state === 'done' ? <Icon type="check" className="w-4 h-4" /> : s.state === 'stopped' ? <Icon type="x" className="w-4 h-4" /> : i + 1}
                                </span>
                                <span className={`text-sm ${s.state === 'todo' ? 'text-slate-500' : 'font-semibold text-abisso'}`}>
                                    {s.label}
                                    <span className="sr-only">{s.state === 'done' ? ' (fatto)' : s.state === 'current' ? ' (in corso)' : s.state === 'stopped' ? ' (concluso)' : ' (da fare)'}</span>
                                </span>
                            </li>
                        ))}
                    </ol>
                    <p className="mt-4 text-sm text-slate-700">{candidateHint[application.status]}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                        {application.status === 'hired' && (
                            <Link to={`/profile/${job.structureId}?area=staff`} className="px-4 py-2 rounded-full text-sm font-semibold bg-cloro-100 text-cloro-800 hover:bg-cloro-200">Vai all’area staff</Link>
                        )}
                        <Link to={`/messages?u=${encodeURIComponent(job.structureId)}`} className="px-4 py-2 rounded-full text-sm font-semibold bg-white border border-slate-200 text-abisso hover:border-slate-300 inline-flex items-center gap-1.5">
                            <Icon type="chat-bubble" className="w-4 h-4" /> Scrivi alla struttura
                        </Link>
                        <Link to="/jobs/candidature" className="px-4 py-2 rounded-full text-sm font-semibold bg-white border border-slate-200 text-abisso hover:border-slate-300">Tutte le mie candidature</Link>
                        {application.status !== 'hired' && (
                            <button onClick={withdraw} className="px-4 py-2 rounded-full text-sm font-semibold text-slate-600 hover:text-galleggiante-700 hover:bg-red-50">Ritira</button>
                        )}
                    </div>
                    <p className="sr-only">Stato: {STATUS[application.status].candidate}</p>
                </section>
            )}

            {/* Affinità con il proprio profilo */}
            {requirements && !isManager && (
                <section className="bg-white rounded-3xl border border-slate-200 shadow-card p-5 sm:p-7" aria-labelledby="match-title">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h2 id="match-title" className="text-2xl font-bold text-abisso">Il tuo profilo e i requisiti</h2>
                        <span className="text-sm font-semibold text-abisso">{requirements.filter((r) => r.met).length} di {requirements.length} soddisfatti</span>
                    </div>
                    <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                        {requirements.map((r) => (
                            <li key={r.label} className="flex items-start gap-2 text-sm">
                                <span className={`mt-0.5 w-5 h-5 rounded-full grid place-items-center flex-shrink-0 ${r.met ? 'bg-cloro-100 text-cloro-800' : 'bg-slate-100 text-slate-500'}`} aria-hidden="true">
                                    <Icon type={r.met ? 'check' : 'x'} className="w-3 h-3" />
                                </span>
                                <span className={r.met ? 'text-slate-800' : 'text-slate-600'}>
                                    {r.label}
                                    <span className="sr-only">{r.met ? ': presente nel tuo profilo' : ': non trovato nel tuo profilo'}</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                    {requirements.some((r) => !r.met) && (
                        <p className="mt-4 text-sm text-slate-600">
                            Hai un brevetto o un’esperienza che non risulta? <Link to="/profile" className="font-semibold text-corsia-700 hover:underline py-1 -my-1">Aggiungilo al profilo</Link>: la struttura vede l’affinità.
                        </p>
                    )}
                </section>
            )}

            <section className="bg-white rounded-3xl border border-slate-200 shadow-card p-5 sm:p-7" aria-labelledby="desc-title">
                <h2 id="desc-title" className="text-2xl font-bold text-abisso">Descrizione</h2>
                <p className="mt-3 text-slate-700 leading-relaxed whitespace-pre-wrap">{job.description}</p>
                {(job.requirements?.length || job.qualificationsRequired?.length) ? (
                    <div className="mt-6 grid gap-6 sm:grid-cols-2">
                        {!!job.requirements?.length && (
                            <div>
                                <h3 className="font-semibold text-abisso">Requisiti</h3>
                                <ul className="mt-2 space-y-1.5 list-disc pl-5 text-slate-700">{job.requirements.map((r) => <li key={r}>{r}</li>)}</ul>
                            </div>
                        )}
                        {!!job.qualificationsRequired?.length && (
                            <div>
                                <h3 className="font-semibold text-abisso">Brevetti richiesti</h3>
                                <ul className="mt-2 space-y-1.5 list-disc pl-5 text-slate-700">{job.qualificationsRequired.map((r) => <li key={r}>{r}</li>)}</ul>
                            </div>
                        )}
                    </div>
                ) : null}
            </section>

            {!isManager && (
                <Link to={`/profile/${job.structureId}`} className="bg-white rounded-3xl border border-slate-200 shadow-card p-5 sm:p-6 flex items-center gap-4 hover:border-corsia-300 transition-colors">
                    <img src={logo} alt="" className="w-12 h-12 rounded-xl object-cover bg-white border border-slate-100" />
                    <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-abisso">{job.structureName || 'La struttura'}</span>
                        <span className="block text-sm text-slate-500">Impianto, servizi, recensioni e altre posizioni aperte</span>
                    </span>
                    <Icon type="chevron-right" className="w-5 h-5 text-slate-400" />
                </Link>
            )}

            {/* Smartphone: candidatura sempre a portata di pollice */}
            {!isManager && (
                <div className="sm:hidden sticky bottom-0 -mx-4 px-4 py-3 bg-white/95 backdrop-blur border-t border-slate-200 flex gap-2">
                    <button onClick={() => toggleSaved('job', job.$id)} aria-pressed={saved} aria-label={saved ? 'Rimuovi dai salvati' : 'Salva l’offerta'} className="w-12 flex-shrink-0 rounded-full border border-slate-200 grid place-items-center text-corsia-700">
                        <Icon type="bookmark" className={`w-5 h-5 ${saved ? 'fill-corsia-200' : ''}`} />
                    </button>
                    <div className="flex-1">
                        <ApplyButton job={job} open={open} applied={!!application} canApply={apply.canApply} onApply={() => apply.start(job)} full />
                    </div>
                </div>
            )}

            {apply.modal}
            {isManager && (
                <>
                    <CreateJobModal isOpen={editing} onClose={() => setEditing(false)} structureId={job.structureId} job={job} onJobCreated={(j) => j && setJob(j)} />
                    <CreateJobModal isOpen={reposting} onClose={() => setReposting(false)} structureId={job.structureId} template={job} onJobCreated={(j) => j && navigate(`/jobs/${j.$id}`)} />
                </>
            )}
        </div>
    );
};

const ApplyButton: React.FC<{ job: Job; open: boolean; applied: boolean; canApply: boolean; onApply: () => void; full?: boolean }> = ({ open, applied, canApply, onApply, full }) => {
    const cls = `${full ? 'w-full justify-center' : ''} px-5 py-2.5 rounded-full text-sm font-semibold inline-flex items-center gap-1.5`;
    if (applied) return <span className={`${cls} bg-cloro-50 text-cloro-800 border border-cloro-200`}><Icon type="check" className="w-4 h-4" /> Candidatura inviata</span>;
    if (!open) return <span className={`${cls} bg-slate-100 text-slate-600`}><Icon type="lock-closed" className="w-4 h-4" /> Posizione chiusa</span>;
    if (!canApply) return null;
    return (
        <button onClick={onApply} className={`${cls} bg-corsia-600 text-white hover:bg-corsia-700`}>
            <Icon type="send" className="w-4 h-4" /> Candidati
        </button>
    );
};

export default JobPage;
