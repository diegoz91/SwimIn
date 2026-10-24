import React, { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { UserProfile, StructureProfile } from '@/types/types';
import { initialsAvatar } from '@/utils/avatar';

export interface EnrichedConnectionRequest {
    $id: string;
    senderId: string;
    receiverId: string;
    status: 'pending' | 'accepted' | 'rejected';
    $createdAt: string;
    senderProfile?: UserProfile | StructureProfile; 
}

interface ConnectionRequestCardProps {
    request: EnrichedConnectionRequest;
    onSelectProfile: (userId: string) => void;
    onAccept: (connectionId: string) => Promise<void>;
    onReject: (connectionId: string) => Promise<void>;
}

export const ConnectionRequestCard: React.FC<ConnectionRequestCardProps> = ({ 
    request, 
    onSelectProfile,
    onAccept,
    onReject
}) => {
    const [isProcessing, setIsProcessing] = useState(false);
    const profile = request.senderProfile;

    if (!profile) return null;

    const isProfessional = profile.userType === 'professional';
    
    const displayName = isProfessional 
        ? `${(profile as UserProfile).firstName || ''} ${(profile as UserProfile).lastName || ''}`.trim() || 'Utente'
        : (profile as StructureProfile).structureName || 'Struttura';
    
    const displayTitle = isProfessional 
        ? ((profile as UserProfile).title || 'Professionista del nuoto') 
        : ((profile as StructureProfile).structureType || 'Centro sportivo');

    const displayAvatar = (isProfessional ? (profile as UserProfile).avatar : (profile as StructureProfile).logo) || 
        initialsAvatar(displayName);

    const getSwimBadges = () => {
        if (!isProfessional || !(profile as UserProfile).certificationsList) return [];
        const str = JSON.stringify((profile as UserProfile).certificationsList).toLowerCase();
        const badges = [];
        if (str.includes('fin') || str.includes('federazione')) badges.push({ id: 'fin', text: 'FIN', style: 'bg-orange-100 text-orange-700 border-orange-200' });
        if (str.includes('salvamento') || str.includes('sns') || str.includes('bagnanti')) badges.push({ id: 'salvamento', text: 'Salvamento', style: 'bg-red-100 text-red-700 border-red-200' });
        return badges.slice(0, 2);
    };

    const handleAction = async (action: 'accept' | 'reject') => {
        if (isProcessing) return;
        setIsProcessing(true);
        try {
            if (action === 'accept') {
                await onAccept(request.$id);
            } else {
                await onReject(request.$id);
            }
        } finally {
            setIsProcessing(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectProfile(profile.userId || profile.$id);
        }
    };

    return (
        <div className="flex items-center justify-between p-4 sm:p-5 bg-white border border-slate-200 rounded-2xl hover:shadow-md transition-all group">
            
            {/* Area Info Utente */}
            <div 
                className="flex items-center gap-4 flex-1 min-w-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-xl p-1"
                onClick={() => onSelectProfile(profile.userId || profile.$id)}
                role="button"
                tabIndex={0}
                onKeyDown={handleKeyDown}
                aria-label={`Visualizza profilo di ${displayName}`}
            >
                <img 
                    src={displayAvatar} 
                    alt={`Avatar di ${displayName}`} 
                    className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover border border-slate-100 shadow-sm bg-slate-50 flex-shrink-0"
                    loading="lazy"
                />
                <div className="min-w-0 pr-4">
                    <div className="flex items-center gap-2">
                        <h3 className="font-bold text-base sm:text-lg text-slate-800 leading-tight truncate group-hover:text-blue-600 transition-colors">
                            {displayName}
                        </h3>
                        {/* Rendering dei Badge Nuoto */}
                        {getSwimBadges().map(b => (
                            <span key={b.id} className={`hidden sm:inline-block text-[10px] font-extrabold px-1.5 py-0.5 rounded border ${b.style}`}>{b.text}</span>
                        ))}
                    </div>
                    <p className="text-xs sm:text-sm text-slate-500 truncate mt-1">{displayTitle}</p>
                    <p className="text-[11px] font-medium text-slate-400 mt-1.5 flex items-center gap-1">
                        <Icon type="clock" className="w-3 h-3 opacity-70" />
                        Ricevuta il {new Date(request.$createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                </div>
            </div>

            {/* Pulsanti Azione */}
            <div className="flex items-center gap-2 flex-shrink-0">
                <button 
                    onClick={() => handleAction('reject')}
                    disabled={isProcessing}
                    className="p-2.5 sm:p-3 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-full transition-all outline-none focus-visible:ring-2 focus-visible:ring-red-500 active:scale-95 disabled:opacity-50"
                    title="Rifiuta richiesta"
                    aria-label="Rifiuta connessione"
                >
                    <Icon type="x" className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
                <button 
                    onClick={() => handleAction('accept')}
                    disabled={isProcessing}
                    className="p-2.5 sm:px-5 sm:py-2.5 text-blue-600 bg-blue-50 hover:bg-blue-600 hover:text-white rounded-full transition-all outline-none focus-visible:ring-2 focus-visible:ring-blue-500 active:scale-95 shadow-sm font-bold flex items-center gap-2 disabled:opacity-50"
                    title="Accetta richiesta"
                    aria-label="Accetta connessione"
                >
                    {isProcessing ? (
                        <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <>
                            <Icon type="check" className="w-5 h-5 sm:w-5 sm:h-5" />
                            <span className="hidden sm:inline">Accetta</span>
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};