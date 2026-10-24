import React from 'react';
import type { UserProfile, StructureProfile, Facility } from '@/types/types';
import { ConnectionRequestCard, type EnrichedConnectionRequest } from './ConnectionRequestCard';
import { ConnectionSuggestionCard } from './ConnectionSuggestionCard';
import { Icon } from '@/components/ui/Icon';
import { initialsAvatar } from '@/utils/avatar';

type Profile = UserProfile | StructureProfile;

interface NetworkViewProps {
    currentUser: UserProfile | StructureProfile;
    pendingRequests: EnrichedConnectionRequest[];
    suggestions: Profile[];
    activeConnections: Profile[];
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    searchResults: { profiles: Profile[], facilities: Facility[] };
    isLoading?: boolean;
    isSearching?: boolean;
    onSelectProfile: (userId: string) => void;
    onAcceptRequest: (connectionId: string) => Promise<void>;
    onRejectRequest: (connectionId: string) => Promise<void>;
    onSendRequest: (userId: string) => Promise<void>;
    onRemoveConnection: (userId: string) => void;
    onMessage: (userId: string) => void;
}

export const NetworkView: React.FC<NetworkViewProps> = ({ 
    currentUser, 
    pendingRequests,
    suggestions,
    activeConnections,
    searchQuery,
    setSearchQuery,
    searchResults,
    isLoading = false,
    isSearching = false,
    onSelectProfile,
    onAcceptRequest,
    onRejectRequest,
    onSendRequest,
    onRemoveConnection,
    onMessage
}) => {
    
    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 min-h-[50vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-slate-200 border-t-blue-600 shadow-sm"></div>
                <p className="text-slate-500 font-bold mt-4 animate-pulse">Sincronizzazione network...</p>
            </div>
        );
    }

    const hasSearchResults = searchResults.profiles.length > 0 || searchResults.facilities.length > 0;
    const myConnectionIds = currentUser.connections || [];

    return (
        <div className="max-w-7xl mx-auto w-full animate-in fade-in duration-500">
            
            {/* 🔍 BARRA DI RICERCA UNIVERSALE */}
            <div className="mb-8">
                <div className="relative max-w-3xl mx-auto group">
                    <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                        {isSearching ? (
                             <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                        ) : (
                            <Icon type="search" className="h-6 w-6 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                        )}
                    </div>
                    <input 
                        type="text" 
                        placeholder="Cerca colleghi, istruttori, strutture aziendali, città..." 
                        className="w-full pl-14 pr-4 py-4 bg-white border border-slate-200 rounded-2xl shadow-sm text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none text-lg transition-all"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery('')} className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 outline-none">
                            <Icon type="x" className="h-5 w-5" />
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
                
                {/* 📇 COLONNA SINISTRA: RUBRICA COLLEGAMENTI */}
                <div className="lg:col-span-1">
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden lg:sticky lg:top-24">
                        <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                            <h2 className="font-extrabold text-slate-800 flex items-center gap-2">
                                <Icon type="users" className="w-5 h-5 text-blue-600" /> I tuoi collegamenti
                            </h2>
                            <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded-full">{activeConnections.length}</span>
                        </div>
                        
                        <div className="p-2 max-h-[60vh] overflow-y-auto custom-scrollbar">
                            {activeConnections.length > 0 ? (
                                <div className="space-y-1">
                                    {activeConnections.map(conn => {
                                        const id = conn.userId || conn.$id;
                                        const isProf = conn.userType === 'professional';
                                        const name = isProf ? `${(conn as UserProfile).firstName} ${(conn as UserProfile).lastName}`.trim() : (conn as StructureProfile).structureName;
                                        const role = isProf ? (conn as UserProfile).title : (conn as StructureProfile).structureType;
                                        const avatar = (isProf ? (conn as UserProfile).avatar : (conn as StructureProfile).logo) || initialsAvatar(name || 'U');

                                        return (
                                            <div key={id} className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl transition-colors group">
                                                <img 
                                                    src={avatar} 
                                                    alt={name}
                                                    className="w-12 h-12 rounded-full object-cover border border-slate-200 shadow-sm cursor-pointer" 
                                                    onClick={() => onSelectProfile(id)}
                                                />
                                                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onSelectProfile(id)}>
                                                    <h4 className="font-bold text-slate-800 text-sm truncate group-hover:text-blue-600 transition-colors">{name}</h4>
                                                    <p className="text-xs text-slate-500 truncate">{role || 'Membro SwimIn'}</p>
                                                </div>
                                                {/* Azioni Rapide Hover */}
                                                <div className="flex items-center opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity gap-1">
                                                    <button onClick={() => onMessage(id)} className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg outline-none" title="Invia messaggio">
                                                        <Icon type="chat-bubble" className="w-4 h-4"/>
                                                    </button>
                                                    <button onClick={() => onRemoveConnection(id)} className="p-2 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-lg outline-none" title="Rimuovi">
                                                        <Icon type="user-minus" className="w-4 h-4"/>
                                                    </button>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            ) : (
                                <div className="text-center py-10 px-4">
                                    <div className="bg-slate-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                                        <Icon type="users" className="w-6 h-6 text-slate-300" />
                                    </div>
                                    <p className="text-sm font-bold text-slate-600">Nessun collegamento</p>
                                    <p className="text-xs text-slate-500 mt-1">Usa la barra di ricerca o i suggerimenti per espandere la tua rete.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* 🎯 COLONNA DESTRA: RISULTATI, RICHIESTE E SUGGERIMENTI */}
                <div className="lg:col-span-2 space-y-6">
                    
                    {/* 1. RISULTATI RICERCA */}
                    {searchQuery.trim().length >= 2 && (
                        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 animate-in slide-in-from-top-4">
                            <h2 className="text-lg font-extrabold text-slate-800 mb-6 flex items-center gap-2">
                                <Icon type="search" className="w-5 h-5 text-blue-600" />
                                Risultati per "{searchQuery}"
                            </h2>

                            {!hasSearchResults && !isSearching ? (
                                <p className="text-slate-500 text-center py-6 font-medium">Nessun risultato trovato.</p>
                            ) : (
                                <div className="space-y-6">
                                    {/* Profili Trovati */}
                                    {searchResults.profiles.length > 0 && (
                                        <div>
                                            <h3 className="text-sm font-semibold text-slate-500 mb-3 pl-2">Persone</h3>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                {searchResults.profiles.map(prof => (
                                                    <ConnectionSuggestionCard 
                                                        key={prof.userId || prof.$id}
                                                        user={prof}
                                                        onSelectProfile={onSelectProfile}
                                                        onConnect={onSendRequest}
                                                        isAlreadyConnected={myConnectionIds.includes(prof.userId || prof.$id)}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Strutture Trovate */}
                                    {searchResults.facilities.length > 0 && (
                                        <div className={searchResults.profiles.length > 0 ? "pt-6 border-t border-slate-100" : ""}>
                                            <h3 className="text-sm font-semibold text-slate-500 mb-3 pl-2">Strutture</h3>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                {searchResults.facilities.map(fac => (
                                                    <div key={fac.$id} onClick={() => onSelectProfile(fac.$id)} className="flex items-center gap-4 p-4 border border-slate-200 rounded-2xl hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group bg-slate-50 hover:bg-white">
                                                        <img src={fac.logo || initialsAvatar(fac.name)} alt={fac.name} className="w-14 h-14 rounded-xl object-cover border border-slate-200 shadow-sm" />
                                                        <div className="min-w-0 flex-1">
                                                            <h3 className="font-bold text-slate-800 truncate group-hover:text-blue-600 transition-colors">{fac.name}</h3>
                                                            <p className="text-xs text-slate-500 truncate">{fac.type || 'Centro sportivo'} • {fac.city}</p>
                                                        </div>
                                                        <Icon type="chevron-right" className="w-5 h-5 text-slate-300 group-hover:text-blue-500" />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* 2. RICHIESTE IN SOSPESO (Nascoste se c'è una ricerca attiva) */}
                    {!searchQuery && pendingRequests.length > 0 && (
                        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
                            <h2 className="text-lg font-extrabold text-slate-800 mb-4 flex items-center gap-2">
                                <Icon type="users" className="w-5 h-5 text-blue-600" />
                                Richieste in sospeso ({pendingRequests.length})
                            </h2>
                            <div className="space-y-3">
                                {pendingRequests.map(req => (
                                    <div key={req.$id} className="bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden">
                                        <ConnectionRequestCard 
                                            request={req}
                                            onSelectProfile={onSelectProfile}
                                            onAccept={onAcceptRequest}
                                            onReject={onRejectRequest}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 3. SUGGERIMENTI INTELLIGENTI (Nascosti se c'è una ricerca attiva) */}
                    {!searchQuery && (
                        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
                            <h2 className="text-lg font-extrabold text-slate-800 mb-6 flex items-center gap-2">
                                <Icon type="sparkles" className="w-5 h-5 text-amber-500" />
                                Potresti conoscere...
                            </h2>
                            
                            {suggestions.length > 0 ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {suggestions.map(prof => (
                                        <ConnectionSuggestionCard 
                                            key={prof.userId || prof.$id}
                                            user={prof}
                                            onSelectProfile={onSelectProfile}
                                            onConnect={onSendRequest}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-slate-100">
                                        <Icon type="globe" className="w-8 h-8 text-slate-300" />
                                    </div>
                                    <p className="text-slate-600 font-bold text-lg">Hai raggiunto il bordo vasca!</p>
                                    <p className="text-slate-500 text-sm mt-2 max-w-sm mx-auto">
                                        Non ci sono nuovi suggerimenti al momento. Usa la barra di ricerca per trovare colleghi o strutture specifiche.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};