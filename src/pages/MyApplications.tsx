import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useToast } from '@/context/ToastContext';
import { databaseService, type MyApplication } from '@/services/database';
import { Icon } from '@/components/ui/Icon';
import { PageLoader } from '@/components/common/PageLoader';
import { useApplyFlow } from '@/features/jobs/useApplyFlow';
import { STATUS, candidateSteps } from '@/features/jobs/applicationStatus';
import { isJobOpen, jobDisplayTitle } from '@/utils/jobs';
import { initialsAvatar } from '@/utils/avatar';
import { formatRelativeTime } from '@/utils/format';
import { useConfirm } from '@/context/ConfirmContext';

type Filter = 'attive' | 'assunzioni' | 'concluse';
const FILTERS: { id: Filter; label: string; match: (a: MyApplication) => boolean }[] = [
    { id: 'attive', label: 'In corso', match: (a) => ['pending', 'reviewed', 'accepted'].includes(a.status) },
    { id: 'assunzioni', label: 'Assunzioni', match: (a) => a.status === 'hired' },
    { id: 'concluse', label: 'Non selezionate', match: (a) => a.status === 'rejected' },
];

/** Le mie candidature (/jobs/candidature): stato a tappe di ognuna, ritiro, link all'annuncio. */
const MyApplications: React.FC = () => {
    const confirm = useConfirm();
    usePageTitle('Le mie candidature');
    const { showToast } = useToast();
    const apply = useApplyFlow();
    const [chosen, setFilter] = useState<Filter | null>(null);
    const list = apply.applications;
    const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, (list || []).filter(f.match).length])) as Record<Filter, number>, [list]);

    if (list === null) return <PageLoader />;
    // Si parte dal primo elenco che ha qualcosa (es. solo assunzioni).
    const filter: Filter = chosen ?? FILTERS.find((f) => counts[f.id] > 0)?.id ?? 'attive';
    const shown = list.filter(FILTERS.find((f) => f.id === filter)!.match);

    const withdraw = async (a: MyApplication) => {
        if (!(await confirm({ title: 'Ritirare la candidatura?', message: 'La struttura non la vedrà più.', confirmLabel: 'Ritira', tone: 'danger' }))) return;
        try {
            await databaseService.withdrawApplication(a.$id);
            await apply.reload();
            showToast('Candidatura ritirata.', 'info');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Ritiro non riuscito.', 'error');
        }
    };

    return (
        <div className="pt-4 pb-10 max-w-3xl mx-auto w-full">
            <Link to="/jobs" className="py-1 -my-1 inline-flex items-center gap-1.5 text-sm font-semibold text-corsia-700 hover:text-corsia-900">
                <Icon type="arrow-left" className="w-4 h-4" /> Lavoro
            </Link>
            <h1 className="mt-3 text-4xl font-bold text-abisso leading-none">Le mie candidature</h1>
            <p className="text-slate-600 mt-2">Ogni candidatura con la sua fase: ti avvisiamo quando la struttura la seleziona o decide.</p>

            <div className="mt-5 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filtra le candidature">
                {FILTERS.map((f) => (
                    <button
                        key={f.id}
                        role="tab"
                        aria-selected={filter === f.id}
                        onClick={() => setFilter(f.id)}
                        className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold border ${filter === f.id ? 'bg-abisso text-white border-abisso' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                    >
                        {f.label} <span className="tabular-nums opacity-80">{counts[f.id]}</span>
                    </button>
                ))}
            </div>

            {shown.length === 0 ? (
                <div className="mt-6 bg-white border border-dashed border-slate-300 rounded-3xl p-10 text-center">
                    <Icon type="send" className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                    <h2 className="text-xl font-semibold text-abisso">{list.length === 0 ? 'Non ti sei ancora candidato' : 'Nessuna candidatura in questo elenco'}</h2>
                    <p className="text-slate-500 mt-1">{list.length === 0 ? 'Trova un’offerta in bacheca: bastano due tocchi con la candidatura rapida.' : 'Le altre sono negli elenchi accanto.'}</p>
                    {list.length === 0 && <Link to="/jobs" className="inline-block mt-5 px-5 py-2.5 rounded-full text-sm font-semibold bg-corsia-600 text-white hover:bg-corsia-700">Vai alle offerte</Link>}
                </div>
            ) : (
                <ul className="mt-6 space-y-3">
                    {shown.map((a) => {
                        const job = a.job;
                        const steps = candidateSteps(a.status);
                        const s = STATUS[a.status];
                        return (
                            <li key={a.$id} className="bg-white rounded-2xl border border-slate-200 shadow-card p-5">
                                <div className="flex items-start gap-3">
                                    <img src={job?.facilityLogo || initialsAvatar(job?.structureName || 'S')} alt="" className="w-12 h-12 rounded-xl object-cover bg-white border border-slate-100 flex-shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        <h2 className="font-semibold text-abisso leading-snug">
                                            {job ? <Link to={`/jobs/${job.$id}`} className="hover:underline">{jobDisplayTitle(job)}</Link> : 'Annuncio rimosso'}
                                        </h2>
                                        <p className="text-sm text-slate-600 truncate">{[job?.structureName, job?.city].filter(Boolean).join(' · ')}</p>
                                        <p className="text-xs text-slate-500 mt-0.5">Inviata {formatRelativeTime(a.$createdAt)}{job && !isJobOpen(job) && a.status !== 'hired' ? ' · annuncio chiuso' : ''}</p>
                                    </div>
                                    <span className={`flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border inline-flex items-center gap-1 ${s.tone}`}><Icon type={s.icon} className="w-3 h-3" />{s.candidate}</span>
                                </div>
                                {/* Barra delle tappe */}
                                <div className="mt-4 flex gap-1.5" aria-hidden="true">
                                    {steps.map((st) => (
                                        <span key={st.label} className={`h-1.5 flex-1 rounded-full ${st.state === 'done' ? 'bg-cloro-600' : st.state === 'current' ? 'bg-corsia-600' : st.state === 'stopped' ? 'bg-slate-400' : 'bg-slate-200'}`} />
                                    ))}
                                </div>
                                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                                    {job && <Link to={`/jobs/${job.$id}`} className="py-1 -my-1 font-semibold text-corsia-700 hover:underline">Vedi il percorso</Link>}
                                    {a.status === 'hired' && job && <Link to={`/profile/${job.structureId}?area=staff`} className="py-1 -my-1 font-semibold text-cloro-800 hover:underline">Area staff</Link>}
                                    {job && <Link to={`/messages?u=${encodeURIComponent(job.structureId)}`} className="py-1 -my-1 font-semibold text-corsia-700 hover:underline">Scrivi alla struttura</Link>}
                                    {a.status !== 'hired' && <button onClick={() => withdraw(a)} className="py-1 -my-1 font-semibold text-slate-600 hover:text-galleggiante-700">Ritira</button>}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};

export default MyApplications;
