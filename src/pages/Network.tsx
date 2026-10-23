import React, { useState, useEffect, useCallback } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { databaseService } from '@/services/database';
import { useToast } from '@/context/ToastContext';
import { NetworkView } from '@/features/network/components/NetworkView';
import { Icon } from '@/components/ui/Icon';
import { emitNetworkChange, useNetworkChange } from '@/utils/networkEvents';
import { formatDate } from '@/utils/dates';
import { CreateMeetModal } from '@/features/network/components/CreateMeetModal';
import type { UserProfile, StructureProfile, Facility, SwimMeet } from '@/types/types';
import type { EnrichedConnectionRequest } from '@/features/network/components/ConnectionRequestCard';

type Profile = UserProfile | StructureProfile;

const Network: React.FC = () => {
    usePageTitle('Il mio network');
    const { user: currentUser, refreshProfile } = useAuth();
    const navigate = useNavigate();
    const { showToast } = useToast();
    
    // GESTIONE TAB (Connessioni vs Eventi Locali)
    const [activeTab, setActiveTab] = useState<'network' | 'meets'>('network');

    // --------------------------------------------------------
    // STATI: NETWORK DIGITALE
    // --------------------------------------------------------
    const [pendingRequests, setPendingRequests] = useState<EnrichedConnectionRequest[]>([]);
    const [suggestions, setSuggestions] = useState<Profile[]>([]);
    const [activeConnections, setActiveConnections] = useState<Profile[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<{profiles: Profile[], facilities: Facility[]}>({profiles: [], facilities: []});
    const [isLoadingNetwork, setIsLoadingNetwork] = useState(true);
    const [isSearching, setIsSearching] = useState(false);

    // --------------------------------------------------------
    // STATI: SWIM-MEETS
    // --------------------------------------------------------
    const [meets, setMeets] = useState<SwimMeet[]>([]);
    const [isLoadingMeets, setIsLoadingMeets] = useState(false);
    const [isCreatingMeet, setIsCreatingMeet] = useState(false);

    // ========================================================
    // NETWORK DIGITALE
    // ========================================================
    const loadNetworkData = useCallback(async () => {
        if (!currentUser) return;
        setIsLoadingNetwork(true);
        try {
            const requests = await databaseService.getPendingConnectionRequests(currentUser.$id);
            const enrichedReqs = await Promise.all(requests.map(async (req) => {
                try {
                    const senderProfile = await databaseService.getProfile(req.senderId);
                    return { ...req, senderProfile } as EnrichedConnectionRequest;
                } catch { return null; }
            }));
            setPendingRequests(enrichedReqs.filter(Boolean) as EnrichedConnectionRequest[]);

            const suggs = await databaseService.getNetworkSuggestions(currentUser.$id, currentUser.connections || []);
            setSuggestions(suggs);

            const conns = await databaseService.getConnectionsProfiles(currentUser.connections || []);
            setActiveConnections(conns);
        } catch (error) {
            showToast('Errore nel caricamento del network.', 'error');
        } finally {
            setIsLoadingNetwork(false);
        }
    }, [currentUser, showToast]);

    useEffect(() => { loadNetworkData(); }, [loadNetworkData]);

    // Cambiamenti fatti altrove (es. "Accetta" dal profilo o dall'altra persona): riallinea gli elenchi.
    useNetworkChange((change) => {
        if (change.type === 'remote') loadNetworkData();
    });

    useEffect(() => {
        if (!currentUser) return;
        const timer = setTimeout(async () => {
            if (searchQuery.trim().length >= 2) {
                setIsSearching(true);
                try {
                    const results = await databaseService.searchNetwork(searchQuery, currentUser.$id);
                    setSearchResults(results);
                } catch (error) {
                    console.error('Ricerca non riuscita:', error);
                    showToast('Ricerca non disponibile al momento. Riprova.', 'error');
                } finally {
                    setIsSearching(false);
                }
            } else {
                setSearchResults({profiles: [], facilities: []});
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [searchQuery, currentUser, showToast]);

    const handleAcceptRequest = async (connectionId: string) => {
        if (!currentUser) return;
        const req = pendingRequests.find(r => r.$id === connectionId);
        if (!req) return;
        try {
            await databaseService.acceptConnectionRequest(connectionId, req.senderId, req.receiverId);
            showToast('Ora siete collegati.', 'success');
            setPendingRequests(prev => prev.filter(r => r.$id !== connectionId));
            setSuggestions(prev => prev.filter(s => (s.userId || s.$id) !== req.senderId));
            setSearchResults(prev => ({ ...prev, profiles: prev.profiles.filter(p => (p.userId || p.$id) !== req.senderId) }));
            if (req.senderProfile) setActiveConnections(prev => prev.some(c => (c.userId || c.$id) === req.senderId) ? prev : [req.senderProfile!, ...prev]);
            emitNetworkChange({ type: 'accepted', userId: req.senderId });
            refreshProfile().catch((e) => console.warn('Aggiornamento profilo:', e));
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Errore durante l\'accettazione.', 'error');
        }
    };

    const handleRejectRequest = async (connectionId: string) => {
        try {
            await databaseService.rejectConnectionRequest(connectionId);
            showToast('Richiesta rifiutata.', 'info');
            const req = pendingRequests.find(r => r.$id === connectionId);
            setPendingRequests(prev => prev.filter(r => r.$id !== connectionId));
            emitNetworkChange({ type: 'rejected', userId: req?.senderId });
        } catch (error) { showToast('Errore durante il rifiuto.', 'error'); }
    };

    const handleSendRequest = async (targetUserId: string) => {
        if (!currentUser) return;
        try {
            await databaseService.sendConnectionRequest(currentUser.$id, targetUserId);
            showToast('Richiesta inviata.', 'success');
            setSuggestions(prev => prev.filter(s => (s.userId || s.$id) !== targetUserId));
            emitNetworkChange({ type: 'sent', userId: targetUserId });
            setSearchResults(prev => ({...prev, profiles: prev.profiles.filter(p => (p.userId || p.$id) !== targetUserId)}));
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Impossibile inviare la richiesta.', 'error');
        }
    };

    const handleRemoveConnection = async (targetUserId: string) => {
        if (!currentUser) return;
        if (window.confirm('Sei sicuro di voler rimuovere questo collegamento?')) {
            const success = await databaseService.removeConnection(currentUser.$id, targetUserId);
            if (success) {
                showToast('Collegamento rimosso.', 'info');
                setActiveConnections(prev => prev.filter(c => (c.userId || c.$id) !== targetUserId));
                emitNetworkChange({ type: 'removed', userId: targetUserId });
                refreshProfile().catch((e) => console.warn('Aggiornamento profilo:', e));
            } else showToast('Errore durante la rimozione.', 'error');
        }
    };

    const handleSelectProfile = (userId: string) => navigate(`/profile/${userId}`);
    const handleMessage = (userId: string) => navigate(`/messages`, { state: { startChatWithUserId: userId } });

    // ========================================================
    // SWIM-MEETS
    // ========================================================
    const loadMeetsData = useCallback(async () => {
        setIsLoadingMeets(true);
        try {
            const fetchedMeets = await databaseService.getActiveSwimMeets();
            setMeets(fetchedMeets);
        } catch (e) { showToast('Errore nel caricamento eventi.', 'error'); } 
        finally { setIsLoadingMeets(false); }
    }, [showToast]);

    useEffect(() => {
        if (activeTab === 'meets') loadMeetsData();
    }, [activeTab, loadMeetsData]);

    const handleJoinMeet = async (meetId: string) => {
        if (!currentUser) return;
        try {
            await databaseService.joinSwimMeet(meetId, currentUser.$id);
            showToast('Ti sei unito all\'evento!', 'success');
            loadMeetsData();
        } catch (error: any) { showToast(error.message || 'Impossibile partecipare.', 'error'); }
    };

    const handleLeaveMeet = async (meetId: string) => {
        if (!currentUser) return;
        try {
            await databaseService.leaveSwimMeet(meetId, currentUser.$id);
            showToast('Hai annullato la tua partecipazione.', 'info');
            loadMeetsData();
        } catch (error) { showToast('Errore.', 'error'); }
    };

    const handleCancelMeet = async (meetId: string) => {
        if (!window.confirm('Sicuro di voler annullare questo evento? La decisione è irreversibile.')) return;
        try {
            await databaseService.cancelSwimMeet(meetId);
            showToast('Evento annullato.', 'info');
            loadMeetsData();
        } catch (error) { showToast('Errore.', 'error'); }
    };

    if (!currentUser) return null;

    return (
        <div className="pt-4 w-full">
            
            {/* TAB SWITCHER */}
            <div className="flex justify-center mb-8 animate-in slide-in-from-top-4">
                <div className="bg-slate-100 p-1.5 rounded-2xl inline-flex shadow-inner border border-slate-200">
                    <button
                        onClick={() => setActiveTab('network')}
                        className={`px-5 sm:px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'network' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Icon type="users" className="w-4 h-4" />
                        <span>Collegamenti</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('meets')}
                        className={`px-5 sm:px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'meets' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Icon type="location" className="w-4 h-4" />
                        <span>Swim-Meet</span>
                    </button>
                </div>
            </div>

            {/* RENDER VISTA ATTIVA */}
            {activeTab === 'network' ? (
                <div className="animate-in fade-in duration-500">
                    <NetworkView 
                        currentUser={currentUser}
                        pendingRequests={pendingRequests}
                        suggestions={suggestions}
                        activeConnections={activeConnections}
                        searchQuery={searchQuery}
                        setSearchQuery={setSearchQuery}
                        searchResults={searchResults}
                        isLoading={isLoadingNetwork}
                        isSearching={isSearching}
                        onSelectProfile={handleSelectProfile}
                        onAcceptRequest={handleAcceptRequest}
                        onRejectRequest={handleRejectRequest}
                        onSendRequest={handleSendRequest}
                        onRemoveConnection={handleRemoveConnection}
                        onMessage={handleMessage}
                    />
                </div>
            ) : (
                <div className="max-w-5xl mx-auto w-full animate-in fade-in zoom-in-95 duration-500">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                        <div>
                            <h1 className="text-3xl font-extrabold text-slate-800 flex items-center gap-3">
                                Swim-Meets 
                                <span className="bg-green-100 text-green-700 text-[10px] uppercase tracking-wider px-2 py-1 rounded-md font-black border border-green-200">Reale</span>
                            </h1>
                            <p className="text-slate-500 mt-1">Incontra i professionisti della tua zona. Partecipa o organizza eventi a bordo vasca o in città.</p>
                        </div>
                        <button 
                            onClick={() => setIsCreatingMeet(true)} 
                            className="w-full md:w-auto bg-green-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-green-700 transition-colors shadow-sm flex items-center justify-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-green-500 active:scale-95"
                        >
                            <Icon type="plus" className="w-5 h-5" /> Crea Evento
                        </button>
                    </div>

                    {isLoadingMeets ? (
                        <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-4 border-slate-200 border-t-green-500"></div></div>
                    ) : meets.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {meets.map(meet => {
                                const isCreator = meet.creatorId === currentUser.$id;
                                const isParticipating = (meet.participants || []).includes(currentUser.$id);
                                const isFull = Boolean(meet.maxParticipants && (meet.participants || []).length >= meet.maxParticipants);

                                return (
                                    <div key={meet.$id} className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 flex flex-col relative overflow-hidden group hover:shadow-md transition-shadow">
                                        {isCreator && <div className="absolute top-0 right-0 bg-amber-100 text-amber-700 text-[10px] font-bold px-3 py-1.5 rounded-bl-xl shadow-sm border-b border-l border-amber-200 z-10">ORGANIZZATORE</div>}
                                        
                                        <h3 className="font-extrabold text-xl text-slate-800 pr-16 leading-tight mb-2 group-hover:text-green-600 transition-colors">{meet.title}</h3>
                                        <p className="text-sm text-slate-500 mb-6 line-clamp-2">{meet.description}</p>

                                        <div className="space-y-2.5 mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                            <div className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                                                <div className="bg-white p-1.5 rounded-lg border border-slate-200 shadow-sm text-green-500"><Icon type="calendar" className="w-4 h-4" /></div> 
                                                {formatDate(meet.date)} alle {meet.time}
                                            </div>
                                            <div className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                                                <div className="bg-white p-1.5 rounded-lg border border-slate-200 shadow-sm text-blue-500"><Icon type="location" className="w-4 h-4" /></div> 
                                                <span className="truncate">{meet.city} {meet.address && ` - ${meet.address}`}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                                                <div className="bg-white p-1.5 rounded-lg border border-slate-200 shadow-sm text-purple-500"><Icon type="users" className="w-4 h-4" /></div> 
                                                {(meet.participants || []).length} {meet.maxParticipants ? `/ ${meet.maxParticipants}` : ''} Partecipanti
                                            </div>
                                        </div>

                                        <div className="mt-auto pt-4 border-t border-slate-100 flex gap-2">
                                            {isCreator ? (
                                                <button onClick={() => handleCancelMeet(meet.$id)} className="w-full bg-white text-red-500 font-bold py-2.5 rounded-xl hover:bg-red-50 transition-colors text-sm border border-red-200 outline-none focus-visible:ring-2 focus-visible:ring-red-500">Annulla Evento</button>
                                            ) : isParticipating ? (
                                                <button onClick={() => handleLeaveMeet(meet.$id)} className="w-full bg-slate-100 text-slate-600 font-bold py-2.5 rounded-xl hover:bg-slate-200 transition-colors text-sm border border-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-slate-500">Non partecipo più</button>
                                            ) : (
                                                <button onClick={() => handleJoinMeet(meet.$id)} disabled={isFull} className="w-full bg-green-600 text-white font-bold py-2.5 rounded-xl hover:bg-green-700 transition-colors text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-green-500 active:scale-95">
                                                    {isFull ? 'Posti esauriti' : 'Partecipa all\'evento'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    ) : (
                        <div className="bg-white rounded-3xl p-12 text-center shadow-sm border border-slate-200 border-dashed">
                            <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-green-100">
                                <Icon type="location" className="w-10 h-10 text-green-500" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-800 mb-2">Nessun evento in zona</h3>
                            <p className="text-slate-500 max-w-sm mx-auto">Non ci sono incontri programmati al momento. Diventa tu l'organizzatore del prossimo Swim-Meet!</p>
                        </div>
                    )}
                </div>
            )}

            <CreateMeetModal open={isCreatingMeet} onClose={() => setIsCreatingMeet(false)} onCreated={loadMeetsData} />
        </div>
    );
};

export default Network;