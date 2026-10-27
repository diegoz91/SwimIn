import React, { useState } from 'react';
import type { UserProfile, StructureProfile } from '@/types/types';
import { Icon } from '@/components/ui/Icon';
import { initialsAvatar } from '@/utils/avatar';

interface ConnectionSuggestionCardProps {
    user: UserProfile | StructureProfile;
    onSelectProfile: (userId: string) => void;
    onConnect: (userId: string) => Promise<void>; 
    isAlreadyConnected?: boolean;
}

export const ConnectionSuggestionCard: React.FC<ConnectionSuggestionCardProps> = ({ 
    user, 
    onSelectProfile, 
    onConnect,
    isAlreadyConnected = false 
}) => {
    const [isDismissed, setIsDismissed] = useState(false);
    const [requestSent, setRequestSent] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);

    if (isDismissed) return null;

    const isProfessional = user.userType === 'professional';
    const userId = user.userId || user.$id;
    
    const fullName = isProfessional 
        ? `${(user as UserProfile).firstName || ''} ${(user as UserProfile).lastName || ''}`.trim() || 'Utente'
        : (user as StructureProfile).structureName || 'Struttura';
        
    const title = isProfessional 
        ? ((user as UserProfile).title || user.city || 'Professionista del nuoto')
        : ((user as StructureProfile).structureType || user.city || 'Centro sportivo');
        
    const displayAvatar = (isProfessional ? (user as UserProfile).avatar : (user as StructureProfile).logo) || 
        initialsAvatar(fullName);

    const getSwimBadges = () => {
        if (!isProfessional || !(user as UserProfile).certificationsList) return [];
        const str = JSON.stringify((user as UserProfile).certificationsList).toLowerCase();
        const badges = [];
        if (str.includes('fin') || str.includes('federazione')) badges.push({ id: 'fin', text: 'FIN', style: 'bg-orange-100 text-orange-700 border-orange-200' });
        if (str.includes('salvamento') || str.includes('sns') || str.includes('bagnanti')) badges.push({ id: 'salvamento', text: 'Salvamento', style: 'bg-red-100 text-red-700 border-red-200' });
        return badges.slice(0, 2);
    };

    const handleConnect = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsConnecting(true);
        try {
            await onConnect(userId);
            setRequestSent(true);
        } catch (error) {
            console.error("Errore invio richiesta:", error);
        } finally {
            setIsConnecting(false);
        }
    };

    const handleDismiss = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsDismissed(true);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectProfile(userId);
        }
    };

    return (
        <div 
            className="flex flex-col items-center text-center bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-md transition-all relative group focus-within:ring-2 focus-within:ring-blue-500 cursor-pointer"
            onClick={() => onSelectProfile(userId)}
        >
            <button 
                onClick={handleDismiss}
                className="absolute top-3 right-3 text-slate-300 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-full transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100 outline-hidden focus-visible:ring-2 focus-visible:ring-slate-400"
                title="Rimuovi suggerimento"
            >
                <Icon type="x" className="w-4 h-4" />
            </button>

            <div className="relative mb-3">
                <img 
                    src={displayAvatar} 
                    alt={fullName}
                    className="w-20 h-20 rounded-full object-cover border border-slate-100 shadow-xs bg-slate-50"
                    loading="lazy"
                />
                {!isProfessional && (
                    <div className="absolute -bottom-2 -right-2 bg-blue-100 text-blue-600 p-1.5 rounded-full border-2 border-white shadow-xs">
                        <Icon type="building" className="w-3.5 h-3.5" />
                    </div>
                )}
            </div>
            
            <h3 className="font-bold text-slate-800 text-base leading-tight w-full truncate px-2" title={fullName}>
                {/* Il nome è il punto di accesso da tastiera alla scheda: la card intera resta cliccabile col mouse. */}
                <button type="button" onClick={(e) => { e.stopPropagation(); onSelectProfile(userId); }} onKeyDown={handleKeyDown} className="py-1 -my-1 max-w-full truncate outline-hidden focus-visible:underline" aria-label={`Visualizza profilo di ${fullName}`}>
                    {fullName}
                </button>
            </h3>
            
            <p className="text-sm text-slate-500 mb-2 line-clamp-1 w-full px-2" title={title}>
                {title}
            </p>

            <div className="flex gap-1 h-5 mb-3">
                {getSwimBadges().map(b => (
                    <span key={b.id} className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm border ${b.style}`}>{b.text}</span>
                ))}
            </div>
            
            {isAlreadyConnected ? (
                <button 
                    disabled
                    className="w-full bg-slate-100 text-slate-500 font-bold py-2 rounded-xl flex items-center justify-center gap-2 cursor-not-allowed border border-slate-200 transition-all"
                >
                    <Icon type="users" className="w-4 h-4"/>
                    <span>Collegato</span>
                </button>
            ) : requestSent ? (
                <button 
                    disabled
                    className="w-full bg-green-50 text-green-700 font-semibold py-2 rounded-xl flex items-center justify-center gap-2 cursor-not-allowed border border-green-100 transition-all"
                >
                    <Icon type="check-double" className="w-4 h-4"/>
                    <span>Inviata</span>
                </button>
            ) : (
                <button 
                    onClick={handleConnect} 
                    disabled={isConnecting}
                    className="w-full bg-blue-50 text-blue-700 border border-blue-100 font-bold py-2 rounded-xl hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all flex items-center justify-center gap-2 shadow-xs disabled:opacity-50 disabled:cursor-not-allowed outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                >
                    {isConnecting ? (
                         <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <>
                            <Icon type="plus" className="w-4 h-4"/>
                            <span>Connetti</span>
                        </>
                    )}
                </button>
            )}
        </div>
    );
};