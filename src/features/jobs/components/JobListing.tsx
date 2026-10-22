import React from 'react';
import type { Job, UserProfile } from '@/types/types';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/useAuth';
import { initialsAvatar } from '@/utils/avatar';
import { jobDisplayTitle } from '@/utils/jobs';

interface JobListingProps {
  job: Job; 
  onSelectJob: () => void;
  view?: 'dashboard' | 'lavoro';
}

const getSwimMatchScore = (user: UserProfile, job: Job) => {
    const reqs = job.requirements || [];
    const quals = job.qualificationsRequired || [];
    const totalReqs = [...reqs, ...quals];
    if (totalReqs.length === 0) return null;

    const userCerts = (user.certificationsList || []).map(c => {
        try { return JSON.parse(c as string).name.toLowerCase(); } catch { return String(c).toLowerCase(); }
    });
    const userExp = (user.experienceList || []).map(e => {
        try { return JSON.parse(e as string).role.toLowerCase(); } catch { return String(e).toLowerCase(); }
    }).join(" ");

    let metCount = 0;
    totalReqs.forEach(req => {
        const reqLower = req.toLowerCase();
        let isMet = false;
        if (userCerts.some(cert => cert.includes(reqLower) || reqLower.includes(cert))) isMet = true;
        if (!isMet && (userExp.includes(reqLower) || reqLower.includes(userExp))) isMet = true;
        if (!isMet && reqLower.includes('esperienz') && userExp.length > 5) isMet = true;
        if (isMet) metCount++;
    });

    return Math.round((metCount / totalReqs.length) * 100);
};

export const JobListing: React.FC<JobListingProps> = ({ 
  job, 
  onSelectJob, 
  view = 'lavoro' 
}) => {
  const { user } = useAuth();
  const structureName = job.structureName || 'Struttura Non Specificata';
  const locationString = job.city ? `${job.city}${job.province ? ` (${job.province})` : ''}` : 'Sede non specificata';
  const displayLogo = job.facilityLogo || initialsAvatar(structureName);

  const matchScore = user?.userType === 'professional' ? getSwimMatchScore(user as UserProfile, job) : null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelectJob();
    }
  };

  if (view === 'dashboard') {
    return (
       <div 
          className="bg-white rounded-2xl shadow-sm border border-slate-200 hover:shadow-md hover:border-blue-200 transition-all cursor-pointer relative overflow-hidden group focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2" 
          onClick={onSelectJob}
          role="button"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          aria-label={`Visualizza offerta: ${jobDisplayTitle(job)}`}
        >
            {matchScore !== null && matchScore >= 70 && (
                <div className="absolute top-0 right-0 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-bl-lg flex items-center gap-1 z-10" title={`Ottimo Match: ${matchScore}%`}>
                    <Icon type="sparkles" className="w-3 h-3" /> {matchScore}%
                </div>
            )}
            <div className="p-4 flex items-start gap-4">
                <img 
                    src={displayLogo} 
                    alt={`Logo ${structureName}`} 
                    className="w-12 h-12 rounded-xl object-cover border border-slate-100 bg-slate-50 flex-shrink-0"
                    loading="lazy"
                />
                <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors line-clamp-2 leading-tight">
                        {jobDisplayTitle(job)}
                    </h3>
                    <p className="text-sm text-slate-500 mt-1 truncate">{structureName}</p>
                    
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] font-medium">
                        <span className="flex items-center text-slate-400">
                            <Icon type="location" className="w-3.5 h-3.5 mr-1" />
                            <span className="truncate max-w-[100px]">{locationString}</span>
                        </span>
                        {job.contractType && (
                            <span className="flex items-center text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded capitalize">
                                <Icon type="briefcase" className="w-3.5 h-3.5 mr-1" />
                                <span>{job.contractType}</span>
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
  }

  return (
    <div 
        className="flex items-start gap-3 cursor-pointer group p-2 hover:bg-slate-50 rounded-xl transition-colors focus:outline-none focus:bg-slate-50 focus:ring-2 focus:ring-blue-200 relative" 
        onClick={onSelectJob}
        role="button"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        aria-label={`Visualizza offerta: ${jobDisplayTitle(job)}`}
    >
      <img 
        src={displayLogo} 
        alt={`Logo ${structureName}`} 
        className="w-10 h-10 rounded-lg object-cover mt-0.5 border border-slate-100 flex-shrink-0 bg-white" 
        loading="lazy"
      />
      <div className="min-w-0 flex-1">
        <p className="font-bold text-sm text-slate-800 group-hover:text-blue-600 transition-colors line-clamp-1 leading-tight pr-8">
            {jobDisplayTitle(job)}
        </p>
        <p className="text-xs text-slate-500 truncate mt-0.5">{structureName}</p>
        <div className="flex items-center text-[11px] font-medium text-slate-400 mt-1">
          <Icon type="location" className="w-3 h-3 mr-1 opacity-70" />
          <span className="truncate">{locationString}</span>
        </div>
      </div>
      
      {matchScore !== null && matchScore >= 70 && (
        <div className="absolute top-2 right-2 flex items-center justify-center bg-green-100 text-green-600 rounded-full p-1" title={`Ottimo Match: ${matchScore}%`}>
            <Icon type="check-double" className="w-3 h-3" />
        </div>
      )}
    </div>
  );
};