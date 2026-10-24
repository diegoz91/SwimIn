import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Application, Job } from '@/types/types';
import { ApplicationCard } from './ApplicationCard';
import { Icon } from '@/components/ui/Icon';
import { initialsAvatar } from '@/utils/avatar';
import { jobDisplayTitle } from '@/utils/jobs';

export interface EnrichedApplication extends Application {
    job?: Job;
    facilityLogo?: string;
}

interface MyApplicationsViewProps {
    applications: EnrichedApplication[];
    onBack: () => void;
    onSelectJob: (id: string) => void;
    onWithdraw?: (applicationId: string) => void;
}

// 💡 Aggiunto il filtro Assunzioni
type StatusFilter = 'all' | 'pending' | 'accepted' | 'hired' | 'rejected';

const filters: { id: StatusFilter; label: string }[] = [
    { id: 'all', label: 'Tutte' },
    { id: 'pending', label: 'In corso' },
    { id: 'hired', label: 'Assunzioni' },
    { id: 'rejected', label: 'Rifiutate' },
];

export const MyApplicationsView: React.FC<MyApplicationsViewProps> = ({ 
    applications, 
    onBack, 
    onSelectJob,
    onWithdraw 
}) => {
    const [activeFilter, setActiveFilter] = useState<StatusFilter>('all');
    const navigate = useNavigate();

    const filteredApplications = applications.filter(app => {
        if (activeFilter === 'all') return true;
        if (activeFilter === 'pending') return app.status === 'pending' || app.status === 'reviewed';
        if (activeFilter === 'hired') return app.status === 'hired' || app.status === 'accepted';
        return app.status === activeFilter;
    });

    return (
        <div className="max-w-4xl mx-auto w-full pb-8 animate-in fade-in duration-500">
            <div className="flex items-center justify-between mb-6">
                <button 
                    onClick={onBack} 
                    className="text-blue-600 font-semibold hover:underline flex items-center gap-2 group transition-all outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded px-1"
                >
                    <Icon type="arrow-left" className="w-5 h-5 group-hover:-translate-x-1 transition-transform" /> 
                    Torna alle offerte
                </button>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 sm:p-8 mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800">Le mie candidature</h1>
                    <p className="text-slate-500 font-medium mt-1">Monitora lo stato delle tue applicazioni di lavoro.</p>
                </div>
                <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-xl font-bold border border-blue-100">
                    {applications.length} Inviate
                </div>
            </div>

            <div className="flex overflow-x-auto hide-scrollbar-mobile mb-6 pb-2 gap-2">
                {filters.map(filter => (
                    <button
                        key={filter.id}
                        onClick={() => setActiveFilter(filter.id)}
                        className={`whitespace-nowrap px-5 py-2.5 rounded-full font-bold text-sm transition-all outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-500 ${
                            activeFilter === filter.id 
                                ? 'bg-slate-800 text-white shadow-md' 
                                : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                    >
                        {filter.label}
                    </button>
                ))}
            </div>

            {filteredApplications.length > 0 ? (
                <div className="space-y-4">
                    {filteredApplications.map(app => {
                        // 💡 MAGIA ONBOARDING: LA CARD "ASSUNTO"
                        if (app.status === 'hired' || app.status === 'accepted') {
                            return (
                                <div key={app.$id} className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-400 rounded-2xl p-6 shadow-sm relative overflow-hidden group transition-all hover:shadow-md">
                                    <div className="absolute top-0 right-0 bg-green-500 text-white text-[10px] font-extrabold px-3 py-1 rounded-bl-lg flex items-center gap-1 shadow-sm">
                                        <Icon type="sparkles" className="w-3 h-3"/> ASSUNTO
                                    </div>
                                    <div className="flex flex-col sm:flex-row items-center gap-5">
                                        <img src={app.facilityLogo || initialsAvatar(app.job?.structureName || 'A')} className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover shadow-sm border border-green-200 bg-white flex-shrink-0"/>
                                        <div className="flex-1 text-center sm:text-left">
                                            <h3 className="text-xl font-extrabold text-green-900 leading-tight mb-1">{jobDisplayTitle(app.job)}</h3>
                                            <p className="text-sm font-semibold text-green-700">{app.job?.structureName}</p>
                                            <p className="text-xs text-green-600 mt-2 line-clamp-2 leading-relaxed max-w-xl">{app.job?.description}</p>
                                        </div>
                                        <div className="w-full sm:w-auto mt-4 sm:mt-0">
                                            <button 
                                                onClick={() => navigate(`/profile/${app.job?.structureId}`)} 
                                                className="w-full sm:w-auto bg-green-600 text-white font-bold px-6 py-3.5 rounded-xl hover:bg-green-700 transition-all shadow-md active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 flex items-center justify-center gap-2"
                                            >
                                                <Icon type="building" className="w-5 h-5"/> Area Team
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        }

                        // Rendering standard per altre candidature
                        return (
                            <ApplicationCard 
                                key={app.$id} 
                                application={app} 
                                onSelectJob={onSelectJob} 
                                onWithdraw={onWithdraw}
                            />
                        );
                    })}
                </div>
            ) : (
                <div className="text-center py-16 px-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
                    <div className="bg-slate-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
                        <Icon type="send" className="w-10 h-10 text-slate-300" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800">Nessuna candidatura trovata</h3>
                    <p className="text-slate-500 mt-2 max-w-sm mx-auto">
                        {activeFilter === 'all' 
                            ? 'Non hai ancora inviato nessuna candidatura. Esplora la bacheca lavoro per trovare la tua prossima opportunità!' 
                            : 'Non ci sono candidature in questo stato.'}
                    </p>
                    {activeFilter === 'all' && (
                        <button 
                            onClick={onBack}
                            className="mt-6 bg-blue-600 text-white font-bold px-6 py-2.5 rounded-full hover:bg-blue-700 transition shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        >
                            Esplora le offerte
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};