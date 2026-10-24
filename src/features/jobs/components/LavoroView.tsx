import React, { useState, useEffect, useMemo } from 'react';
import { JobCard } from './JobCard';
import { Icon } from '@/components/ui/Icon';
import { CreateJobModal } from './CreateJobModal';
import { CreateSOSModal } from './CreateSOSModal';
import { Select } from '@/components/form/Pickers';
import { contractLabel } from '@/data/swimming';
import { databaseService } from '@/services/database';
import { useAuth } from '@/hooks/useAuth';
import type { Job, UserProfile } from '@/types/types';
import { Link } from 'react-router-dom';
import { useToast } from '@/context/ToastContext';
import { jobDisplayTitle } from '@/utils/jobs';
import { formatDate } from '@/utils/dates';
import { JobAlertsModal } from './JobAlertsModal';

interface LavoroViewProps {
  onSelectJob: (id: string) => void;
  onApply: (job: Job) => void;
  onShowMyApplications: () => void;
}

const FilterPill: React.FC<{ label: string; active?: boolean; onClick?: () => void }> = ({ label, active, onClick }) => (
    <button 
        onClick={onClick}
        aria-pressed={active}
        className={`flex-shrink-0 flex items-center space-x-2 px-4 py-2 text-sm font-semibold rounded-full border transition-all outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-500 ${
            active 
                ? 'bg-abisso text-white border-abisso' 
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
        }`}
    >
        <span>{label}</span>
    </button>
);

// 🧠 FUZZY MATCH LOGIC
const fuzzyMatch = (pattern: string, str: string) => {
    let patternIdx = 0;
    let strIdx = 0;
    const p = pattern.toLowerCase().replace(/\s+/g, '');
    const s = str.toLowerCase().replace(/\s+/g, '');

    while (patternIdx !== p.length && strIdx !== s.length) {
        if (p[patternIdx] === s[strIdx]) patternIdx++;
        strIdx++;
    }
    // 💡 FIX VERCEL: Usa la lunghezza del pattern (p.length) invece della variabile inesistente patternLength
    return p.length !== 0 && (patternIdx / p.length) > 0.8;
};

export const LavoroView: React.FC<LavoroViewProps> = ({ onSelectJob, onApply, onShowMyApplications }) => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [jobs, setJobs] = useState<Job[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isSOSModalOpen, setIsSOSModalOpen] = useState(false);
    
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState('Tutti');
    const [contractFilter, setContractFilter] = useState('');
    const [nearMe, setNearMe] = useState(false);
    const [sortBy, setSortBy] = useState<'recent' | 'salary'>('recent');
    const [alertsOpen, setAlertsOpen] = useState(false);

    const isStructure = user?.userType === 'structure';

    const loadJobs = async () => {
        setIsLoading(true);
        try {
            const activeJobs = await databaseService.getActiveJobs();
            setJobs(activeJobs);
        } catch (error) {
            showToast("Errore nel caricamento delle offerte.", "error");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { loadJobs(); }, []);

    const filters = [
        { label: 'Tutti' },
        { label: 'Istruttore' },
        { label: 'Bagnino' },
        { label: 'Allenatore' },
        { label: 'Reception' },
    ];

    const contractTypes = useMemo(
        () => [...new Set(jobs.map(j => j.contractType).filter((c): c is string => !!c))].sort(),
        [jobs]
    );
    const myCity = (user?.city || '').trim().toLowerCase();
    const myProvince = (user?.province || '').trim().toLowerCase();
    const canFilterNearMe = !!(myCity || myProvince);

    const filteredJobs = useMemo(() => {
        const list = jobs.filter(job => {
            // Ricerca Fuzzy intelligente
            const q = searchQuery.toLowerCase();
            const matchesSearch = !q || 
                job.title.toLowerCase().includes(q) || 
                job.city.toLowerCase().includes(q) ||
                fuzzyMatch(q, job.role) ||
                fuzzyMatch(q, job.title);

            const matchesFilter = activeFilter === 'Tutti' || job.role.toLowerCase().includes(activeFilter.toLowerCase());
            const matchesContract = !contractFilter || job.contractType === contractFilter;
            const matchesArea = !nearMe || (myCity && job.city.toLowerCase() === myCity) || (myProvince && (job.province || '').toLowerCase() === myProvince);
            return matchesSearch && matchesFilter && matchesContract && matchesArea;
        });
        if (sortBy === 'salary') {
            return [...list].sort((a, b) => (b.salaryMax || b.salaryMin || 0) - (a.salaryMax || a.salaryMin || 0));
        }
        return list;
    }, [jobs, searchQuery, activeFilter, contractFilter, nearMe, myCity, myProvince, sortBy]);
    const hasActiveFilters = !!searchQuery || activeFilter !== 'Tutti' || !!contractFilter || nearMe;
    const resetFilters = () => { setSearchQuery(''); setActiveFilter('Tutti'); setContractFilter(''); setNearMe(false); };

    const sosJobs = filteredJobs.filter(j => j.isSOS);
    // Annunci delle strutture Premium in cima (a parità, l'ordine resta quello della bacheca).
    const regularJobs = filteredJobs.filter(j => !j.isSOS).sort((a, b) => Number(!!b.featured) - Number(!!a.featured));

    return (
        <div className="max-w-5xl mx-auto w-full pb-20 animate-in fade-in duration-500">
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-800">Trova lavoro</h1>
                    <p className="text-slate-500 mt-1">Scopri le opportunità nelle piscine vicino a te.</p>
                </div>
                <div className="flex gap-3 w-full md:w-auto">
                    {user?.userType === 'professional' && (
                        <button
                            onClick={() => setAlertsOpen(true)}
                            className="flex-1 md:flex-none bg-white border border-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-xl hover:bg-slate-50 transition-colors shadow-sm flex items-center justify-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                        >
                            <Icon type="bell" className="w-5 h-5" /> Avvisi
                        </button>
                    )}
                    {user?.userType === 'professional' && (
                        <button 
                            onClick={onShowMyApplications}
                            className="flex-1 md:flex-none bg-white border border-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-xl hover:bg-slate-50 transition-colors shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                        >
                            Le mie candidature
                        </button>
                    )}
                    {(isStructure || ((user as UserProfile | null)?.managedFacilities || []).length > 0) && (
                        <Link
                            to="/talenti"
                            className="flex-1 md:flex-none bg-white border border-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-xl hover:bg-slate-50 transition-colors shadow-sm flex items-center justify-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                        >
                            <Icon type="search" className="w-5 h-5" /> Cerca personale
                        </Link>
                    )}
                    {isStructure && (
                        <button 
                            onClick={() => setIsCreateModalOpen(true)}
                            className="flex-1 md:flex-none bg-blue-600 text-white font-bold px-4 py-2.5 rounded-xl hover:bg-blue-700 transition-colors shadow-sm flex items-center justify-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        >
                            <Icon type="plus" className="w-5 h-5" /> Pubblica annuncio
                        </button>
                    )}
                </div>
            </div>

            {isStructure && (
                <div className="mb-8 p-6 bg-gradient-to-r from-red-600 to-red-800 rounded-3xl shadow-[0_4px_20px_rgba(220,38,38,0.2)] flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="text-white text-center md:text-left">
                        <h2 className="text-2xl font-extrabold flex items-center justify-center md:justify-start gap-2">
                            <Icon type="alert-triangle" className="w-8 h-8 animate-pulse" />
                            Lancia SOS Vasca
                        </h2>
                        <p className="text-red-100 font-medium mt-1">Sostituzione urgente per malattia o assenza? Allerta immediatamente i professionisti in zona.</p>
                    </div>
                    <button 
                        onClick={() => setIsSOSModalOpen(true)} 
                        className="w-full md:w-auto bg-white text-red-600 font-bold px-8 py-3.5 rounded-full hover:bg-red-50 transition-colors shadow-lg active:scale-95 flex items-center justify-center gap-2"
                    >
                        <Icon type="plus" className="w-5 h-5" /> Richiedi Sostituzione
                    </button>
                </div>
            )}

            <div className="bg-white p-2 rounded-2xl shadow-sm border border-slate-200 flex items-center mb-6 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-shadow">
                <div className="pl-4 pr-2 text-slate-400"><Icon type="search" className="w-5 h-5" /></div>
                <input 
                    type="text" 
                    placeholder="Cerca per qualifica, ruolo o città…"
                    aria-label="Cerca offerte di lavoro"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 py-3 px-2 text-slate-700 bg-transparent border-none focus:outline-none focus:ring-0 placeholder-slate-400"
                />
                {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="p-2 text-slate-400 hover:text-slate-600 outline-none focus-visible:text-blue-600 rounded">
                        <Icon type="x" className="w-5 h-5" />
                    </button>
                )}
            </div>

            <div className="flex overflow-x-auto space-x-3 pb-4 mb-4 hide-scrollbar-mobile">
                {filters.map(filter => (
                    <FilterPill 
                        key={filter.label} 
 
                        label={filter.label} 
                        active={activeFilter === filter.label}
                        onClick={() => setActiveFilter(filter.label)}
                    />
                ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 -mt-2 mb-2">
                {contractTypes.length > 0 && (
                    <div className="w-52">
                        <Select size="sm" label="Tipo di contratto" value={contractFilter} onChange={setContractFilter} placeholder="Tutti i contratti" clearLabel="Tutti i contratti" options={contractTypes.map((c) => ({ value: c, label: contractLabel(c) }))} />
                    </div>
                )}
                <button
                    onClick={() => setNearMe((v) => !v)}
                    disabled={!canFilterNearMe}
                    aria-pressed={nearMe}
                    title={canFilterNearMe ? 'Mostra solo offerte nella tua città o provincia' : 'Aggiungi la tua città al profilo per usare questo filtro'}
                    className={`px-3 py-2 rounded-xl border text-sm font-semibold flex items-center gap-1.5 transition disabled:opacity-50 disabled:cursor-not-allowed ${nearMe ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                >
                    <Icon type="location" className="w-4 h-4" /> Nella mia zona
                </button>
                <div className="ml-auto w-44">
                    <Select size="sm" label="Ordina offerte" value={sortBy} onChange={(v) => setSortBy(v as 'recent' | 'salary')} options={[{ value: 'recent', label: 'Più recenti' }, { value: 'salary', label: 'Retribuzione più alta' }]} />
                </div>
            </div>
            {!isLoading && (
                <p className="text-sm text-slate-500" aria-live="polite">
                    {filteredJobs.length} {filteredJobs.length === 1 ? 'offerta' : 'offerte'}
                    {hasActiveFilters && <> · <button onClick={resetFilters} className="py-1 -my-1 font-semibold text-blue-600 hover:underline">azzera filtri</button></>}
                    {hasActiveFilters && user?.userType === 'professional' && <> · <button onClick={() => setAlertsOpen(true)} className="py-1 -my-1 font-semibold text-corsia-700 hover:underline">avvisami per questa ricerca</button></>}
                </p>
            )}

            <div className="mt-6">
                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {[1,2,3,4].map(n => (
                            <div key={n} className="bg-white h-48 rounded-2xl border border-slate-200 p-5 animate-pulse shadow-sm flex flex-col justify-between">
                                <div className="flex items-start space-x-4">
                                    <div className="w-14 h-14 bg-slate-200 rounded-xl" />
                                    <div className="flex-1 space-y-2 py-1"><div className="h-4 bg-slate-200 rounded w-3/4" /><div className="h-3 bg-slate-200 rounded w-1/2" /></div>
                                </div>
                                <div className="h-10 bg-slate-200 rounded-xl w-full" />
                            </div>
                        ))}
                    </div>
                ) : filteredJobs.length > 0 ? (
                    <>
                        {sosJobs.length > 0 && (
                            <div className="mb-10">
                                <h3 className="text-xl font-extrabold text-red-600 flex items-center gap-2 mb-4">
                                    <Icon type="alert-triangle" className="w-6 h-6 animate-pulse" /> Sostituzioni urgenti
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {sosJobs.map(job => (
                                        <div key={job.$id} className="bg-red-50 border-2 border-red-500 rounded-2xl p-5 shadow-[0_0_15px_rgba(239,68,68,0.2)] flex flex-col relative overflow-hidden">
                                            <div className="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg flex items-center gap-1 animate-pulse">
                                                SOS attivo
                                            </div>
                                            <h3 className="text-xl font-extrabold text-red-800 pr-20 line-clamp-2">{jobDisplayTitle(job)}</h3>
                                            <p className="text-sm font-bold text-red-600 mt-1 truncate">{job.structureName || 'Struttura privata'}</p>
                                            
                                            <div className="grid grid-cols-2 gap-2 mt-4 mb-4">
                                                <div className="bg-white/80 p-2 rounded-lg border border-red-100 shadow-sm">
                                                    <p className="text-xs text-red-600 font-semibold">Data</p>
                                                    <p className="text-sm font-bold text-slate-800 truncate">{formatDate(job.sosDate, 'weekday')}</p>
                                                </div>
                                                <div className="bg-white/80 p-2 rounded-lg border border-red-100 shadow-sm">
                                                    <p className="text-xs text-red-600 font-semibold">Turno</p>
                                                    <p className="text-sm font-bold text-slate-800 truncate">{job.sosShift}</p>
                                                </div>
                                                <div className="bg-white/80 p-2 rounded-lg border border-red-100 shadow-sm">
                                                    <p className="text-xs text-red-600 font-semibold">Compenso</p>
                                                    <p className="text-sm font-bold text-slate-800 truncate">€{job.salaryMin}</p>
                                                </div>
                                                <div className="bg-white/80 p-2 rounded-lg border border-red-100 shadow-sm">
                                                    <p className="text-xs text-red-600 font-semibold">Città</p>
                                                    <p className="text-sm font-bold text-slate-800 truncate">{job.city}</p>
                                                </div>
                                            </div>
                                            
                                            <button 
                                                onClick={() => onApply(job)} 
                                                className="w-full bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700 transition-colors shadow-md flex items-center justify-center gap-2 mt-auto outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                                            >
                                                <Icon type="check-double" className="w-5 h-5"/> Mi propongo
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {regularJobs.length > 0 && (
                            <>
                                {sosJobs.length > 0 && <h3 className="text-xl font-extrabold text-slate-800 mb-4">Tutte le offerte</h3>}
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {regularJobs.map(job => (
                                        <JobCard 
                                            key={job.$id} 
                                            job={job} 
                                            onSelectJob={onSelectJob}
                                            onApply={onApply}
                                        />
                                    ))}
                                </div>
                            </>
                        )}
                    </>
                ) : (
                    <div className="bg-slate-50 border border-slate-100 rounded-3xl p-12 text-center shadow-sm">
                        <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                            <Icon type="briefcase" className="w-10 h-10 text-slate-400" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-800 mb-2">Nessun lavoro trovato</h3>
                        <p className="text-slate-500 max-w-md mx-auto">
                            {hasActiveFilters
                                ? 'Nessun annuncio corrisponde ai filtri scelti. Prova ad allargare la ricerca.'
                                : 'Non ci sono annunci attivi al momento. Torna a trovarci presto!'}
                        </p>
                        {hasActiveFilters && (
                            <button 
                                onClick={resetFilters}
                                className="mt-6 font-semibold text-blue-600 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-blue-200 rounded"
                            >
                                Azzera ricerca
                            </button>
                        )}
                    </div>
                )}
            </div>

            {isStructure && user && (
                <>
                    <CreateJobModal 
                        isOpen={isCreateModalOpen}
                        onClose={() => setIsCreateModalOpen(false)}
                        onJobCreated={loadJobs}
                        structureId={user.$id}
                    />
                    <CreateSOSModal 
                        isOpen={isSOSModalOpen}
                        onClose={() => setIsSOSModalOpen(false)}
                        onCreated={loadJobs}
                        structureId={user.$id}
                    />
                </>
            )}
            <JobAlertsModal
                open={alertsOpen}
                onClose={() => setAlertsOpen(false)}
                initial={{
                    query: searchQuery.trim() || (activeFilter !== 'Tutti' ? activeFilter.toLowerCase() : ''),
                    province: nearMe ? (user?.province || '').toUpperCase() : '',
                    contractType: contractFilter,
                }}
            />
        </div>
    );
};