import React from 'react';
import type { Application, Job } from '@/types/types';
import { Icon, type IconType } from '@/components/ui/Icon';
import { initialsAvatar } from '@/utils/avatar';

export interface EnrichedApplication extends Application {
    job?: Job;
    facilityLogo?: string;
}

interface ApplicationCardProps {
    application: EnrichedApplication;
    onSelectJob: (jobId: string) => void;
    onWithdraw?: (applicationId: string) => void;
}

const statusStyles: Record<Application['status'], { text: string; icon: IconType; color: string; bgColor: string }> = {
    'pending': { text: 'Inviata', icon: 'send', color: 'text-slate-600', bgColor: 'bg-slate-100' },
    'reviewed': { text: 'In Revisione', icon: 'search', color: 'text-blue-700', bgColor: 'bg-blue-100' },
    'accepted': { text: 'Accettata', icon: 'certificate', color: 'text-green-700', bgColor: 'bg-green-100' },
    'rejected': { text: 'Rifiutata', icon: 'x', color: 'text-red-700', bgColor: 'bg-red-100' },
    'hired': { text: 'Assunto', icon: 'sparkles', color: 'text-green-700', bgColor: 'bg-green-100' }, // 💡 AGGIUNTO STATO HIRED
};

export const ApplicationCard: React.FC<ApplicationCardProps> = ({ 
    application, 
    onSelectJob, 
    onWithdraw 
}) => {
    const { job, facilityLogo, status, $createdAt, $id, coverLetter } = application;
    
    if (!job) return null;

    const statusInfo = statusStyles[status] || statusStyles['pending'];
    const applicationType = coverLetter ? 'Personalizzata' : 'Rapida';
    
    const formattedDate = new Date($createdAt).toLocaleDateString('it-IT', {
        day: 'numeric', 
        month: 'long', 
        year: 'numeric'
    });

    const displayLogo = facilityLogo || initialsAvatar(job.structureName || 'Facility');

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">
            <div className="p-5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    
                    {/* Dati Struttura e Lavoro */}
                    <div className="flex items-start space-x-4">
                        <img 
                            src={displayLogo} 
                            alt={job.structureName || 'Logo struttura'} 
                            className="w-14 h-14 rounded-lg object-cover border border-slate-100 shadow-sm flex-shrink-0 bg-white"
                        />
                        <div>
                            <h3 
                                className="font-bold text-lg text-slate-800 hover:text-blue-600 cursor-pointer transition-colors line-clamp-1 outline-none focus-visible:underline" 
                                onClick={() => onSelectJob(job.$id)}
                            >
                                {job.title}
                            </h3>
                            <p className="text-md text-slate-600 font-medium">{job.structureName || 'Struttura Privata'}</p>
                            <div className="flex items-center text-sm text-slate-500 mt-1">
                                <Icon type="location" className="w-4 h-4 mr-1 opacity-70" />
                                <span>{job.city}{job.province ? `, ${job.province}` : ''}</span>
                            </div>
                        </div>
                    </div>

                    {/* Badge Stato */}
                    <div className={`inline-flex items-center self-start space-x-2 text-sm font-semibold px-3 py-1.5 rounded-full ${statusInfo.bgColor} ${statusInfo.color}`}>
                        <Icon type={statusInfo.icon} className="w-4 h-4" />
                        <span>{statusInfo.text}</span>
                    </div>

                </div>
            </div>
            
            {/* Footer Card: Metadati e Azioni */}
            <div className="bg-slate-50 border-t border-slate-200 px-5 py-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 text-sm">
                <div className="text-slate-500 flex items-center flex-wrap gap-2">
                    <Icon type="calendar" className="w-4 h-4 opacity-70" />
                    <span>Inviata il <strong>{formattedDate}</strong></span>
                    <span className="hidden sm:inline text-slate-300">•</span>
                    <span className="bg-white border border-slate-200 px-2 py-0.5 rounded text-xs font-medium text-slate-600">
                        Mod. {applicationType}
                    </span>
                </div>
                
                <div className="flex items-center space-x-4 self-end sm:self-auto">
                    {status === 'pending' && onWithdraw && (
                        <button 
                            onClick={() => onWithdraw($id)}
                            className="font-semibold text-slate-500 hover:text-red-600 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-red-200 rounded px-2"
                        >
                            Ritira
                        </button>
                    )}
                    <button 
                        onClick={() => onSelectJob(job.$id)} 
                        className="font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                        Vedi offerta
                    </button>
                </div>
            </div>
        </div>
    );
};