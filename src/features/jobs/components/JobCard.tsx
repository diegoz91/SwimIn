import React, { useMemo } from 'react';
import type { Job, StructureProfile, UserProfile } from '@/types/types';
import { Icon } from '@/components/ui/Icon';
import { PremiumBadge } from '@/features/premium/PremiumBadge';
import { useAuth } from '@/hooks/useAuth';
import { initialsAvatar } from '@/utils/avatar';
import { swimMatchScore } from '@/utils/swimMatch';
import { jobDisplayTitle, jobExpiryLabel } from '@/utils/jobs';
import { contractLabel, jobRoleLabel } from '@/data/swimming';

interface JobCardProps {
    job: Job;
    structure?: StructureProfile | null;
    onSelectJob?: (id: string) => void;
    onApply?: (job: Job) => void;
}

const formatRelativeDate = (dateString?: string) => {
    if (!dateString) return 'Data non disponibile';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'Data non disponibile';
        
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - date.getTime());
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) return 'Oggi';
        if (diffDays === 1) return 'Ieri';
        if (diffDays < 7) return `${diffDays} giorni fa`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} sett. fa`;
        
        return date.toLocaleDateString('it-IT', { 
            day: 'numeric', 
            month: 'short', 
            year: 'numeric' 
        });
    } catch {
        return 'Data non disponibile';
    }
};

const capitalize = (str?: string) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
};

export const JobCard: React.FC<JobCardProps> = ({ job, structure, onSelectJob, onApply }) => {
    const { user } = useAuth();

    const { structureName, structureLogo } = useMemo(() => {
        const name = structure?.structureName || job.structureName || 'Struttura Non Specificata';
        const logo = structure?.logo || initialsAvatar(name);
        return { structureName: name, structureLogo: logo };
    }, [structure, job.structureName]);

    // SwimMatch (Solo Professionisti)
    const rawScore = user?.userType === 'professional' ? swimMatchScore(user as UserProfile, job) : null;
    // Mostriamo l'affinità solo quando c'è almeno un requisito soddisfatto.
    const matchScore = rawScore && rawScore > 0 ? rawScore : null;
    
    const getMatchStyle = (score: number) => {
        if (score >= 80) return 'bg-cloro-500 text-white';
        if (score >= 50) return 'bg-amber-400 text-abisso';
        return 'bg-slate-200 text-slate-700';
    };

    return (
        <div className={`bg-white rounded-2xl shadow-sm border hover:shadow-md transition-all duration-300 flex flex-col h-full group relative ${job.featured ? 'border-oro-300 hover:border-oro-500' : 'border-slate-200 hover:border-blue-200'}`}>
            
            {/* BADGE SWIMMATCH PREDITTIVO */}
            {matchScore !== null && (
                <div className={`absolute -top-3 -right-2 z-10 text-[11px] font-extrabold px-3 py-1 rounded-full shadow-card flex items-center gap-1 ${getMatchStyle(matchScore)} animate-in zoom-in duration-300`}>
                    <Icon type="sparkles" className="w-3 h-3" />
                    Affinità {matchScore}%
                </div>
            )}

            <div className="p-5 flex-1">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start space-x-4 min-w-0">
                        <img 
                            src={structureLogo} 
                            alt={`Logo ${structureName}`} 
                            className="w-14 h-14 rounded-xl object-cover border border-slate-100 shadow-sm bg-slate-50" 
                        />
                        <div className="min-w-0 pr-4">
                            <h3 
                                className="text-lg font-extrabold text-slate-800 hover:text-blue-600 transition-colors cursor-pointer line-clamp-2 leading-tight mb-1" 
                                onClick={() => onSelectJob?.(job.$id)}
                            >
                                {jobDisplayTitle(job)}
                            </h3>
                            <p className="text-sm font-medium text-slate-600 truncate">{structureName}</p>
                            {job.featured && <span className="inline-flex items-center gap-1 mt-1 text-xs font-semibold text-oro-700"><PremiumBadge /> In evidenza</span>}
                        </div>
                    </div>
                </div>
                
                <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-500 mt-4">
                    {job.role && <span className="bg-slate-100 px-2.5 py-1 rounded-md text-slate-700">{jobRoleLabel(job.role)}</span>}
                    {job.contractType && <span className="flex items-center bg-slate-100 px-2.5 py-1 rounded-md"><Icon type="briefcase" className="w-3.5 h-3.5 mr-1" />{contractLabel(job.contractType)}</span>}
                    {job.city && <span className="flex items-center bg-slate-100 px-2.5 py-1 rounded-md"><Icon type="location" className="w-3.5 h-3.5 mr-1" /><span className="truncate max-w-[120px]">{capitalize(job.city)}{job.province ? ` (${job.province})` : ''}</span></span>}
                </div>
                
                <p className="text-xs text-slate-400 mt-4 font-medium flex items-center gap-1.5">
                    <Icon type="clock" className="w-3.5 h-3.5" />
                    Pubblicato {formatRelativeDate(job.$createdAt)}
                    {!job.isSOS && jobExpiryLabel(job) && <span className="text-amber-700 font-semibold">· {jobExpiryLabel(job)}</span>}
                </p>
            </div>
            
            {/* Footer Azioni */}
            <div className="border-t border-slate-100 p-4 bg-slate-50/50 rounded-b-2xl flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3 mt-auto">
                <button 
                    onClick={() => onSelectJob?.(job.$id)} 
                    className="w-full sm:w-auto text-center bg-white border-2 border-slate-200 text-slate-700 font-bold px-5 py-2.5 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-colors text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                >
                    Dettagli
                </button>
                <button 
                    onClick={() => onApply?.(job)} 
                    className="w-full sm:w-auto text-center bg-blue-600 text-white font-bold px-5 py-2.5 rounded-xl hover:bg-blue-700 transition-all text-sm shadow-sm active:scale-95 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    <Icon type="send" className="w-4 h-4" /> Candidati Ora
                </button>
            </div>
        </div>
    );
};