import React from 'react';
import { Link } from 'react-router-dom';
import type { Job, UserProfile } from '@/types/types';
import { Icon } from '@/components/ui/Icon';
import { PremiumBadge } from '@/features/premium/PremiumBadge';
import { useAuth } from '@/hooks/useAuth';
import { initialsAvatar } from '@/utils/avatar';
import { swimMatchScore } from '@/utils/swimMatch';
import { jobDisplayTitle, jobExpiryLabel } from '@/utils/jobs';
import { contractLabel, jobRoleLabel } from '@/data/swimming';
import { formatRelativeTime } from '@/utils/format';

interface JobCardProps {
    job: Job;
    /** Chi guarda può candidarsi (professionista). */
    canApply?: boolean;
    /** Ha già inviato la candidatura. */
    applied?: boolean;
    onApply?: (job: Job) => void;
}

/** Scheda di un annuncio nella bacheca: il titolo porta alla pagina dell'offerta. */
export const JobCard: React.FC<JobCardProps> = ({ job, canApply = false, applied = false, onApply }) => {
    const { user } = useAuth();
    const name = job.structureName || 'Struttura';
    const logo = job.facilityLogo || initialsAvatar(name);
    const raw = user?.userType === 'professional' ? swimMatchScore(user as UserProfile, job) : null;
    // L'affinità si mostra solo quando almeno un requisito è soddisfatto.
    const score = raw && raw > 0 ? raw : null;
    const salary = job.salaryMin && job.salaryMax ? `${job.salaryMin}–${job.salaryMax} €/mese` : job.salaryMin ? `da ${job.salaryMin} €/mese` : job.salaryMax ? `fino a ${job.salaryMax} €/mese` : '';
    const expiry = jobExpiryLabel(job);

    return (
        <article className={`bg-white rounded-2xl border shadow-card flex flex-col h-full transition-colors ${job.featured ? 'border-oro-300 hover:border-oro-500' : 'border-slate-200 hover:border-corsia-300'}`}>
            <div className="p-5 flex-1">
                <div className="flex items-start gap-3">
                    <img src={logo} alt="" className="w-12 h-12 rounded-xl object-cover border border-slate-100 bg-white flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-semibold text-abisso leading-snug line-clamp-2">
                            <Link to={`/jobs/${job.$id}`} className="hover:text-corsia-700 hover:underline">{jobDisplayTitle(job)}</Link>
                        </h3>
                        <p className="text-sm text-slate-600 truncate">{name}</p>
                    </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                    {job.featured && <span className="inline-flex items-center gap-1 font-semibold text-oro-700 bg-oro-50 rounded-full px-2 py-1"><PremiumBadge /> In evidenza</span>}
                    {job.role && <span className="bg-piastrella text-slate-700 rounded-full px-2.5 py-1">{jobRoleLabel(job.role)}</span>}
                    {job.contractType && <span className="bg-piastrella text-slate-700 rounded-full px-2.5 py-1">{contractLabel(job.contractType)}</span>}
                    <span className="bg-piastrella text-slate-700 rounded-full px-2.5 py-1 inline-flex items-center gap-1"><Icon type="location" className="w-3 h-3" />{job.city}{job.province ? ` (${job.province})` : ''}</span>
                    {salary && <span className="bg-cloro-50 text-cloro-800 font-semibold rounded-full px-2.5 py-1">{salary}</span>}
                </div>
                <p className="mt-3 text-xs text-slate-500">
                    Pubblicato {formatRelativeTime(job.$createdAt)}
                    {expiry && <span className="font-semibold text-amber-800"> · {expiry}</span>}
                    {score !== null && <span className={`font-semibold ${score >= 80 ? 'text-cloro-800' : 'text-slate-700'}`}> · affinità {score}%</span>}
                </p>
            </div>
            <div className="px-5 pb-5 flex flex-wrap items-center gap-2">
                {applied ? (
                    <span className="px-4 py-2 rounded-full text-sm font-semibold bg-cloro-50 text-cloro-800 border border-cloro-200 inline-flex items-center gap-1.5"><Icon type="check" className="w-4 h-4" /> Candidatura inviata</span>
                ) : canApply ? (
                    <button onClick={() => onApply?.(job)} className="px-4 py-2 rounded-full text-sm font-semibold bg-corsia-600 text-white hover:bg-corsia-700 inline-flex items-center gap-1.5">
                        <Icon type="send" className="w-4 h-4" /> Candidati
                    </button>
                ) : null}
                <Link to={`/jobs/${job.$id}`} className="px-4 py-2 rounded-full text-sm font-semibold bg-white border border-slate-200 text-abisso hover:border-slate-300" aria-label={`Dettagli: ${jobDisplayTitle(job)}`}>
                    Dettagli
                </Link>
            </div>
        </article>
    );
};
