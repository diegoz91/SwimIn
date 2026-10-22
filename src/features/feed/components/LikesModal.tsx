import React, { useState, useEffect } from 'react';
import { databaseService } from '@/services/database';
import type { UserProfile, StructureProfile } from '@/types/types';
import { Icon } from '@/components/ui/Icon';
import { initialsAvatar } from '@/utils/avatar';

interface LikesModalProps {
    postId: string;
    onClose: () => void;
    onNavigate: (view: 'profile' | 'messages', id: string) => void; 
}

export const LikesModal: React.FC<LikesModalProps> = ({ postId, onClose, onNavigate }) => {
    const [likers, setLikers] = useState<(UserProfile | StructureProfile)[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadLikers = async () => {
            setIsLoading(true);
            try {
                const users = await databaseService.getPostLikers(postId);
                setLikers(users);
            } catch (error) {
                console.error("Errore nel caricamento dei like:", error);
            } finally {
                setIsLoading(false);
            }
        };

        loadLikers();
    }, [postId]);

    const getUserName = (user: UserProfile | StructureProfile) => {
        if (user.userType === 'professional') {
            return `${(user as UserProfile).firstName || ''} ${(user as UserProfile).lastName || ''}`.trim();
        }
        return (user as StructureProfile).structureName || 'Struttura';
    };

    const getUserSubtitle = (user: UserProfile | StructureProfile) => {
        if (user.userType === 'professional') return (user as UserProfile).title || 'Professionista';
        return (user as StructureProfile).structureType || 'Centro Sportivo';
    };

    const getUserAvatar = (user: UserProfile | StructureProfile, name: string) => {
        const avatarUrl = user.userType === 'professional' ? (user as UserProfile).avatar : (user as StructureProfile).logo;
        return avatarUrl || initialsAvatar(name);
    };

    return (
        <div 
            className="fixed inset-0 bg-slate-900 bg-opacity-60 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-opacity"
            onClick={onClose}
        >
            <div 
                className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden transform transition-all animate-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
            >
                <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50/80">
                    <h2 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
                        <Icon type="heart" className="w-5 h-5 text-red-500 fill-current" />
                        Mi piace ({likers.length})
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700 bg-white hover:bg-slate-200 p-2 rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-slate-500">
                        <Icon type="x" className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="overflow-y-auto custom-scrollbar flex-1 p-2">
                    {isLoading ? (
                        <div className="flex justify-center items-center py-10">
                            <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-300 border-t-red-500"></div>
                        </div>
                    ) : likers.length > 0 ? (
                        <div className="space-y-1">
                            {likers.map(user => {
                                const id = user.userId || user.$id;
                                const name = getUserName(user);
                                return (
                                    <div key={id} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl transition-colors group">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <img 
                                                src={getUserAvatar(user, name)} 
                                                alt={`Profilo di ${name}`}
                                                className="w-12 h-12 rounded-full object-cover cursor-pointer border border-slate-200 shadow-sm"
                                                onClick={() => { onClose(); onNavigate('profile', id); }}
                                                loading="lazy"
                                            />
                                            <div className="min-w-0">
                                                <p 
                                                    className="font-bold text-slate-800 cursor-pointer hover:text-blue-600 truncate leading-tight outline-none focus-visible:underline"
                                                    onClick={() => { onClose(); onNavigate('profile', id); }}
                                                >
                                                    {name}
                                                </p>
                                                <p className="text-sm text-slate-500 truncate mt-0.5">{getUserSubtitle(user)}</p>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => { onClose(); onNavigate('messages', id); }} 
                                            className="opacity-0 group-hover:opacity-100 text-blue-600 bg-blue-50 p-2 rounded-full hover:bg-blue-100 transition-all outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-blue-500"
                                            title={`Invia messaggio a ${name}`}
                                        >
                                            <Icon type="chat-bubble" className="w-5 h-5" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-12 px-4">
                            <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3">
                                <Icon type="heart" className="w-8 h-8 text-slate-300" />
                            </div>
                            <p className="text-slate-500 font-medium">Nessun "Mi piace" ancora.</p>
                            <p className="text-sm text-slate-400 mt-1">Sii il primo a reagire a questo post!</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};