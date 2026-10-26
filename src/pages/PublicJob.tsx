import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useToast } from '@/context/ToastContext';
import { databaseService, type PublicJob as PublicJobData } from '@/services/database';
import { Brand } from '@/components/ui/Brand';
import { Icon } from '@/components/ui/Icon';
import { PageLoader } from '@/components/common/PageLoader';
import { contractLabel } from '@/data/swimming';
import { formatDate } from '@/utils/dates';
import { initialsAvatar } from '@/utils/avatar';

const salaryOf = (j: PublicJobData) => {
    const unit = j.isSOS ? 'per il turno' : 'al mese';
    if (j.salaryMin && j.salaryMax && j.salaryMin !== j.salaryMax) return `${j.salaryMin.toLocaleString('it-IT')}–${j.salaryMax.toLocaleString('it-IT')} € ${unit}`;
    const v = j.salaryMax || j.salaryMin;
    return v ? `${v.toLocaleString('it-IT')} € ${unit}` : '';
};

/**
 * Offerta di lavoro pubblica (/offerte/:id): si apre da un link condiviso o da Google Jobs,
 * anche senza account. Per candidarsi serve iscriversi (o accedere).
 */
const PublicJob: React.FC = () => {
    const { id = '' } = useParams();
    const { authenticated } = useAuth();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const [job, setJob] = useState<PublicJobData | null>(null);
    const [error, setError] = useState<string | null>(null);
    usePageTitle(job ? `${job.title} · ${job.structureName}` : error ? 'Offerta non disponibile' : null);

    useEffect(() => {
        let alive = true;
        setJob(null);
        setError(null);
        databaseService
            .getPublicJob(id)
            .then((j) => alive && setJob(j))
            .catch((err) => alive && setError(err instanceof Error ? err.message : 'Offerta non disponibile.'));
        return () => { alive = false; };
    }, [id]);

    const share = async () => {
        const url = `${window.location.origin}/offerte/${id}`;
        try {
            if (navigator.share) await navigator.share({ title: job?.title, url });
            else { await navigator.clipboard.writeText(url); showToast('Link copiato.', 'info'); }
        } catch (err) {
            if ((err as Error)?.name !== 'AbortError') console.warn('Condivisione:', err);
        }
    };

    const place = job ? [job.city, job.province && `(${job.province})`].filter(Boolean).join(' ') : '';
    const salary = job ? salaryOf(job) : '';

    return (
        <div className="min-h-screen bg-piastrella">
            {!authenticated && (
                <header className="bg-white border-b border-slate-200">
                    <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
                        <Link to="/" aria-label="SwimIn, pagina iniziale"><Brand size="sm" /></Link>
                        <nav className="flex items-center gap-2">
                            <Link to="/login" className="px-4 py-2 rounded-full text-sm font-semibold text-abisso hover:bg-white">Accedi</Link>
                            <Link to="/register" className="px-4 py-2 rounded-full text-sm font-semibold bg-corsia-600 text-white hover:bg-corsia-700">Iscriviti</Link>
                        </nav>
                    </div>
                </header>
            )}

            <div className={`max-w-4xl mx-auto px-4 ${authenticated ? 'pt-4' : 'py-8'}`}>
                {error ? (
                    <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
                        <Icon type="briefcase" className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                        <h1 className="text-3xl font-bold text-abisso">Offerta non disponibile</h1>
                        <p className="text-slate-600 mt-2 max-w-md mx-auto">{error}</p>
                        <Link to={authenticated ? '/jobs' : '/register'} className="inline-block mt-6 px-5 py-2.5 rounded-full font-semibold bg-corsia-600 text-white hover:bg-corsia-700">
                            {authenticated ? 'Vedi le offerte aperte' : 'Iscriviti e scopri le offerte'}
                        </Link>
                    </div>
                ) : !job ? (
                    <PageLoader variant="detail" />
                ) : (
                    <article className="space-y-4">
                        <section className="bg-white rounded-2xl border border-slate-200 shadow-card p-5 sm:p-8">
                            {job.isSOS && (
                                <p className="inline-flex items-center gap-1.5 mb-4 text-sm font-semibold text-galleggiante-700 bg-red-50 rounded-full px-3 py-1">
                                    <Icon type="alert-triangle" className="w-4 h-4" /> Sostituzione urgente
                                </p>
                            )}
                            <div className="flex items-start gap-4">
                                <img src={job.structureLogo || initialsAvatar(job.structureName)} alt="" className="w-16 h-16 rounded-2xl object-cover border border-slate-100 bg-white flex-shrink-0" />
                                <div className="min-w-0">
                                    <h1 className="text-3xl sm:text-4xl font-bold text-abisso leading-tight break-words">{job.title}</h1>
                                    <p className="mt-1 text-slate-600">
                                        {authenticated ? (
                                            <Link to={`/profile/${job.structureId}`} className="font-semibold text-abisso hover:underline">{job.structureName}</Link>
                                        ) : (
                                            <Link to={`/u/${job.structureId}`} className="font-semibold text-abisso hover:underline">{job.structureName}</Link>
                                        )}
                                        {place && <> · {place}</>}
                                    </p>
                                </div>
                            </div>

                            <dl className="grid sm:grid-cols-2 gap-3 mt-6 text-sm">
                                {job.contractType && (
                                    <div className="relative pl-8 min-w-0"><dt className="text-slate-500"><Icon type="briefcase" className="absolute left-0 top-0.5 w-5 h-5 text-slate-400" />Contratto</dt><dd className="font-semibold text-abisso">{contractLabel(job.contractType)}</dd></div>
                                )}
                                {salary && (
                                    <div className="relative pl-8 min-w-0"><dt className="text-slate-500"><Icon type="sparkles" className="absolute left-0 top-0.5 w-5 h-5 text-slate-400" />Compenso</dt><dd className="font-semibold text-abisso">{salary}</dd></div>
                                )}
                                {job.isSOS && job.sosDate && (
                                    <div className="relative pl-8 min-w-0"><dt className="text-slate-500"><Icon type="calendar" className="absolute left-0 top-0.5 w-5 h-5 text-slate-400" />Turno</dt><dd className="font-semibold text-abisso first-letter:uppercase">{formatDate(job.sosDate, 'weekday')}{job.sosShift ? `, ${job.sosShift}` : ''}</dd></div>
                                )}
                                {job.workingHours && (
                                    <div className="relative pl-8 min-w-0"><dt className="text-slate-500"><Icon type="clock" className="absolute left-0 top-0.5 w-5 h-5 text-slate-400" />Orario</dt><dd className="font-semibold text-abisso">{job.workingHours}</dd></div>
                                )}
                                <div className="relative pl-8 min-w-0"><dt className="text-slate-500"><Icon type="clock" className="absolute left-0 top-0.5 w-5 h-5 text-slate-400" />Pubblicata</dt><dd className="font-semibold text-abisso">{formatDate(job.postedAt.slice(0, 10))}{job.expiresAt && !job.isSOS ? ` · scade il ${formatDate(job.expiresAt, 'short')}` : ''}</dd></div>
                            </dl>

                            <div className="flex flex-wrap gap-2 mt-6">
                                <button
                                    onClick={() => navigate(authenticated ? `/jobs/${encodeURIComponent(job.id)}` : `/register?offerta=${encodeURIComponent(job.id)}`)}
                                    className="px-6 py-3 rounded-full font-semibold bg-corsia-600 text-white hover:bg-corsia-700 flex items-center gap-2"
                                >
                                    <Icon type="send" className="w-5 h-5" /> {authenticated ? 'Candidati' : 'Iscriviti e candidati'}
                                </button>
                                {!authenticated && <Link to="/login" state={{ from: { pathname: `/jobs/${encodeURIComponent(job.id)}` } }} className="px-6 py-3 rounded-full font-semibold border border-slate-300 text-abisso hover:bg-white">Ho già un account</Link>}
                                <button onClick={share} className="px-5 py-3 rounded-full font-semibold text-slate-600 hover:bg-slate-100 flex items-center gap-2">
                                    <Icon type="share" className="w-5 h-5" /> Condividi
                                </button>
                            </div>
                        </section>

                        <section className="bg-white rounded-2xl border border-slate-200 shadow-card p-5 sm:p-8">
                            <h2 className="text-2xl font-bold text-abisso mb-2">Descrizione</h2>
                            <p className="text-slate-700 whitespace-pre-line break-words">{job.description}</p>
                            {job.requirements.length > 0 && (
                                <>
                                    <h2 className="text-2xl font-bold text-abisso mt-6 mb-2">Requisiti</h2>
                                    <ul className="list-disc pl-5 space-y-1 text-slate-700">{job.requirements.map((r) => <li key={r}>{r}</li>)}</ul>
                                </>
                            )}
                            {job.qualifications.length > 0 && (
                                <>
                                    <h2 className="text-2xl font-bold text-abisso mt-6 mb-2">Brevetti richiesti</h2>
                                    <ul className="flex flex-wrap gap-2">{job.qualifications.map((q) => <li key={q} className="px-3 py-1.5 rounded-full bg-corsia-50 text-corsia-800 text-sm font-semibold">{q}</li>)}</ul>
                                </>
                            )}
                        </section>

                        {!authenticated && (
                            <section className="bg-abisso text-white rounded-2xl p-6 sm:p-8">
                                <h2 className="text-2xl font-bold">Lavori nel nuoto?</h2>
                                <p className="text-white/80 mt-1 max-w-xl">Su SwimIn trovi offerte e sostituzioni nelle piscine della tua zona, con avvisi quando esce l’annuncio giusto per te.</p>
                                <Link to="/register" className="inline-block mt-4 px-5 py-2.5 rounded-full font-semibold bg-white text-abisso hover:bg-piastrella">Crea il tuo profilo gratis</Link>
                            </section>
                        )}
                    </article>
                )}
            </div>
        </div>
    );
};

export default PublicJob;
