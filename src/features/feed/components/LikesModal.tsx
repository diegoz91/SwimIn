import React, { useState, useEffect } from 'react';
import { databaseService } from '@/services/database';
import type { UserProfile, StructureProfile } from '@/types/types';
import { Icon } from '@/components/ui/Icon';
import { initialsAvatar } from '@/utils/avatar';
import { REACTIONS, reactionOf } from '@/data/reactions';

interface LikesModalProps {
    postId: string;
    onClose: () => void;
    onNavigate: (view: 'profile' | 'messages', id: string) => void; 
}

export const LikesModal: React.FC<LikesModalProps> = ({ postId, onClose, onNavigate }) => {
    const [likers, setLikers] = useState<((UserProfile | StructureProfile) & { reaction: string })[]>([]);
    const [filter, setFilter] = useState<string>('all');
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
        return (user as StructureProfile).structureType || 'Centro sportivo';
    };

    const getUserAvatar = (user: UserProfile | StructureProfile, name: string) => {
        const avatarUrl = user.userType === 'professional' ? (user as UserProfile).avatar : (user as StructureProfile).logo;
        return avatarUrl || initialsAvatar(name);
    };

    return (
        <div 
            className="fixed inset-0 bg-abisso/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 transition-opacity"
            onClick={onClose}
        >
            <div 
                className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden transform transition-all animate-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
            >
                <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50/80">
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        Reazioni ({likers.length})
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700 bg-white hover:bg-slate-200 p-2 rounded-full transition-colors outline-hidden focus-visible:ring-2 focus-visible:ring-slate-500">
                        <Icon type="x" className="w-5 h-5" />
                    </button>
                </div>
                
                {likers.length > 0 && (
                    <div className="flex gap-1 px-3 pt-3 overflow-x-auto" role="tablist" aria-label="Filtra per reazione">
                        {[{ key: 'all', label: 'Tutte', emoji: '' }, ...REACTIONS.filter((r) => likers.some((l) => l.reaction === r.key))].map((r) => {
                            const n = r.key === 'all' ? likers.length : likers.filter((l) => l.reaction === r.key).length;
                            return (
                                <button
                                    key={r.key}
                                    role="tab"
                                    aria-selected={filter === r.key}
                                    onClick={() => setFilter(r.key)}
                                    className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold transition-colors ${filter === r.key ? 'bg-corsia-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                >
                                    {r.emoji && <span aria-hidden="true" className="mr-1">{r.emoji}</span>}
                                    {r.key === 'all' ? `${r.label} ${n}` : <><span className="sr-only">{r.label}</span>{n}</>}
                                </button>
                            );
                        })}
                    </div>
                )}

                <div className="overflow-y-auto custom-scrollbar flex-1 p-2">
                    {isLoading ? (
                        <div className="flex justify-center items-center py-10">
                            <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-300 border-t-red-500"></div>
                        </div>
                    ) : likers.length > 0 ? (
                        <div className="space-y-1">
                            {likers.filter((l) => filter === 'all' || l.reaction === filter).map(user => {
                                const id = user.userId || user.$id;
                                const name = getUserName(user);
                                const r = reactionOf(user.reaction);
                                return (
                                    <div key={id} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl transition-colors group">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <span className="relative shrink-0">
                                            <img 
                                                src={getUserAvatar(user, name)} 
                                                alt={`Profilo di ${name}`}
                                                className="w-12 h-12 rounded-full object-cover cursor-pointer border border-slate-200 shadow-xs"
                                                onClick={() => { onClose(); onNavigate('profile', id); }}
                                                loading="lazy"
                                            />
                                            {r && <span className="absolute -bottom-1 -right-1 w-6 h-6 grid place-items-center rounded-full bg-white shadow-sm text-sm leading-none" title={r.label}>{r.emoji}</span>}
                                            </span>
                                            <div className="min-w-0">
                                                <p 
                                                    className="font-bold text-slate-800 cursor-pointer hover:text-blue-600 truncate leading-tight outline-hidden focus-visible:underline"
                                                    onClick={() => { onClose(); onNavigate('profile', id); }}
                                                >
                                                    {name}
                                                </p>
                                                <p className="text-sm text-slate-500 truncate mt-0.5">{getUserSubtitle(user)}</p>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => { onClose(); onNavigate('messages', id); }} 
                                            className="opacity-0 group-hover:opacity-100 text-blue-600 bg-blue-50 p-2 rounded-full hover:bg-blue-100 transition-all outline-hidden focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-blue-500"
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
                                <Icon type="thumb-up" className="w-8 h-8 text-slate-300" />
                            </div>
                            <p className="text-slate-500 font-medium">Ancora nessuna reazione.</p>
                            <p className="text-sm text-slate-400 mt-1">Sii il primo a reagire a questo post!</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};