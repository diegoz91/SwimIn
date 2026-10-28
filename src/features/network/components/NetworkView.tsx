import React, { useState } from 'react';
import type { UserProfile, StructureProfile } from '@/types/types';
import { ConnectionRequestCard, type EnrichedConnectionRequest } from './ConnectionRequestCard';
import { ConnectionSuggestionCard } from './ConnectionSuggestionCard';
import { Icon } from '@/components/ui/Icon';
import { avatarOf, displayNameOf, headlineOf } from '@/utils/profile';
import type { RankedSuggestion } from '../suggestionRank';

type Profile = UserProfile | StructureProfile;

interface NetworkViewProps {
    currentUser: UserProfile | StructureProfile;
    pendingRequests: EnrichedConnectionRequest[];
    /** Già ordinati per affinità (`rankSuggestions`). */
    suggestions: RankedSuggestion[];
    activeConnections: Profile[];
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    searchResults: { profiles: Profile[] };
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
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-slate-200 border-t-blue-600 shadow-xs"></div>
                <p className="text-slate-500 font-bold mt-4 animate-pulse">Sincronizzazione network...</p>
            </div>
        );
    }

    const hasSearchResults = searchResults.profiles.length > 0;
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
                        className="w-full pl-14 pr-4 py-4 bg-white border border-slate-200 rounded-2xl shadow-xs text-slate-800 focus:ring-2 focus:ring-blue-500 outline-hidden text-lg transition-all"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery('')} className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 outline-hidden">
                            <Icon type="x" className="h-5 w-5" />
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 items-start">
                <div className="lg:col-span-2 space-y-6 min-w-0">
                    {/* Risultati della ricerca */}
                    {searchQuery.trim().length >= 2 && (
                        <section className="bg-white rounded-3xl shadow-xs border border-slate-200 p-6" aria-labelledby="network-results">
                            <h2 id="network-results" className="text-lg font-bold text-abisso mb-4 flex items-center gap-2">
                                <Icon type="search" className="w-5 h-5 text-corsia-600" /> Risultati per “{searchQuery}”
                            </h2>
                            {!hasSearchResults && !isSearching ? (
                                <p className="text-slate-500 text-center py-6">Nessun risultato trovato.</p>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {searchResults.profiles.map((prof) => (
                                        <ConnectionSuggestionCard
                                            key={prof.userId || prof.$id}
                                            user={prof}
                                            onSelectProfile={onSelectProfile}
                                            onConnect={onSendRequest}
                                            isAlreadyConnected={myConnectionIds.includes(prof.userId || prof.$id)}
                                        />
                                    ))}
                                </div>
                            )}
                        </section>
                    )}

                    {/* Richieste in sospeso */}
                    {!searchQuery && pendingRequests.length > 0 && (
                        <section className="bg-white rounded-3xl shadow-xs border border-slate-200 p-6" aria-labelledby="network-requests">
                            <h2 id="network-requests" className="text-lg font-bold text-abisso mb-4">Richieste in sospeso ({pendingRequests.length})</h2>
                            <div className="space-y-3">
                                {pendingRequests.map((req) => (
                                    <div key={req.$id} className="bg-piastrella rounded-2xl border border-slate-100 overflow-hidden">
                                        <ConnectionRequestCard request={req} onSelectProfile={onSelectProfile} onAccept={onAcceptRequest} onReject={onRejectRequest} />
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* I tuoi collegamenti: il contenuto principale della pagina */}
                    {!searchQuery && (
                        <section className="bg-white rounded-3xl shadow-xs border border-slate-200 overflow-hidden" aria-labelledby="network-connections">
                            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-3">
                                <h2 id="network-connections" className="text-lg font-bold text-abisso flex items-center gap-2">
                                    <Icon type="users" className="w-5 h-5 text-corsia-600" /> I tuoi collegamenti
                                </h2>
                                <span className="bg-corsia-50 text-corsia-700 text-sm font-semibold px-2.5 py-0.5 rounded-full tabular-nums">{activeConnections.length}</span>
                            </div>
                            {activeConnections.length > 0 ? (
                                <ul className="grid sm:grid-cols-2 gap-px bg-slate-100">
                                    {activeConnections.map((conn) => {
                                        const id = conn.userId || conn.$id;
                                        const name = displayNameOf(conn);
                                        return (
                                            <li key={id} className="bg-white flex items-center gap-3 p-4 min-w-0">
                                                <button type="button" onClick={() => onSelectProfile(id)} tabIndex={-1} aria-hidden="true" className="shrink-0">
                                                    <img src={avatarOf(conn)} alt="" className="w-12 h-12 rounded-full object-cover border border-slate-200" />
                                                </button>
                                                <button type="button" onClick={() => onSelectProfile(id)} className="flex-1 min-w-0 text-left group">
                                                    <span className="block font-semibold text-abisso truncate group-hover:text-corsia-700">{name}</span>
                                                    <span className="block text-sm text-slate-500 truncate">{headlineOf(conn) || 'Membro SwimIn'}</span>
                                                </button>
                                                <button type="button" onClick={() => onMessage(id)} className="p-2 text-corsia-700 hover:bg-corsia-50 rounded-full" aria-label={`Scrivi a ${name}`} title="Invia messaggio">
                                                    <Icon type="chat-bubble" className="w-5 h-5" />
                                                </button>
                                                <button type="button" onClick={() => onRemoveConnection(id)} className="p-2 text-slate-500 hover:text-galleggiante-700 hover:bg-red-50 rounded-full" aria-label={`Rimuovi ${name} dai collegamenti`} title="Rimuovi">
                                                    <Icon type="user-minus" className="w-5 h-5" />
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            ) : (
                                <div className="text-center py-12 px-4">
                                    <Icon type="users" className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                                    <p className="font-semibold text-abisso">Ancora nessun collegamento</p>
                                    <p className="text-sm text-slate-500 mt-1">Cerca colleghi e strutture qui sopra o parti dai suggerimenti.</p>
                                </div>
                            )}
                        </section>
                    )}
                </div>

                {/* Suggerimenti più affini al profilo, in un riquadro compatto */}
                <aside className="lg:sticky lg:top-6 min-w-0" aria-labelledby="network-suggestions">
                    <SuggestionsPanel suggestions={suggestions} onSelectProfile={onSelectProfile} onConnect={onSendRequest} />
                </aside>
            </div>
        </div>
    );
};

const SHOWN = 5;

/** Riquadro "Potresti conoscere": i più affini, con il motivo e il pulsante per collegarsi. */
const SuggestionsPanel: React.FC<{ suggestions: RankedSuggestion[]; onSelectProfile: (id: string) => void; onConnect: (id: string) => Promise<void> }> = ({ suggestions, onSelectProfile, onConnect }) => {
    const [expanded, setExpanded] = useState(false);
    const [sent, setSent] = useState<Set<string>>(() => new Set());
    const [busy, setBusy] = useState<string | null>(null);
    const list = suggestions.slice(0, expanded ? SHOWN * 3 : SHOWN);
    const connect = async (id: string) => {
        setBusy(id);
        try {
            await onConnect(id);
            setSent((s) => new Set(s).add(id));
        } catch (err) {
            console.error('Richiesta di collegamento:', err);
        } finally {
            setBusy(null);
        }
    };
    return (
        <section className="bg-white rounded-3xl shadow-xs border border-slate-200 overflow-hidden">
            <h2 id="network-suggestions" className="px-5 pt-5 pb-2 text-lg font-bold text-abisso flex items-center gap-2">
                <Icon type="sparkles" className="w-5 h-5 text-cloro-700" /> Potresti conoscere
            </h2>
            {list.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-slate-500">Nessun nuovo suggerimento: cerca colleghi o strutture con la barra qui sopra.</p>
            ) : (
                <ul className="pb-2">
                    {list.map(({ profile, reason }) => {
                        const id = profile.userId || profile.$id;
                        const name = displayNameOf(profile);
                        const done = sent.has(id);
                        return (
                            <li key={id} className="flex items-center gap-3 px-5 py-2.5 min-w-0">
                                <button type="button" onClick={() => onSelectProfile(id)} tabIndex={-1} aria-hidden="true" className="shrink-0">
                                    <img src={avatarOf(profile)} alt="" className="w-11 h-11 rounded-full object-cover border border-slate-200" />
                                </button>
                                <button type="button" onClick={() => onSelectProfile(id)} className="flex-1 min-w-0 text-left group">
                                    <span className="block font-semibold text-abisso truncate group-hover:text-corsia-700">{name}</span>
                                    <span className="block text-sm text-slate-500 truncate">{headlineOf(profile)}</span>
                                    {reason && <span className="block text-xs text-cloro-800 truncate">{reason}</span>}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void connect(id)}
                                    disabled={done || busy === id}
                                    aria-label={done ? `Richiesta inviata a ${name}` : `Collegati con ${name}`}
                                    title={done ? 'Richiesta inviata' : 'Collegati'}
                                    className={`shrink-0 w-10 h-10 rounded-full border grid place-items-center ${done ? 'border-cloro-200 bg-cloro-50 text-cloro-800' : 'border-corsia-200 text-corsia-700 hover:bg-corsia-50'} disabled:cursor-default`}
                                >
                                    <Icon type={done ? 'check' : 'plus'} className="w-5 h-5" />
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
            {suggestions.length > SHOWN && (
                <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="w-full border-t border-slate-100 py-3 text-sm font-semibold text-corsia-700 hover:bg-piastrella">
                    {expanded ? 'Mostra meno' : 'Mostra altri suggerimenti'}
                </button>
            )}
        </section>
    );
};
