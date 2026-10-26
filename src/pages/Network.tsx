import React, { useState, useEffect, useCallback } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { databaseService } from '@/services/database';
import { useToast } from '@/context/ToastContext';
import { NetworkView } from '@/features/network/components/NetworkView';
import { Icon } from '@/components/ui/Icon';
import { emitNetworkChange, useNetworkChange } from '@/utils/networkEvents';
import type { UserProfile, StructureProfile, Facility } from '@/types/types';
import type { EnrichedConnectionRequest } from '@/features/network/components/ConnectionRequestCard';
import { useBlocks } from '@/context/BlocksContext';
import { useConfirm } from '@/context/ConfirmContext';

type Profile = UserProfile | StructureProfile;

const Network: React.FC = () => {
    const confirm = useConfirm();
    usePageTitle('Il mio network');
    const { user: currentUser, refreshProfile } = useAuth();
    const blocks = useBlocks();
    const navigate = useNavigate();
    const { showToast } = useToast();
    
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
        if (await confirm({ title: 'Rimuovere il collegamento?', message: 'Non vedrete più i rispettivi contatti riservati; potrete ricollegarvi in seguito.', confirmLabel: 'Rimuovi', tone: 'danger' })) {
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

    if (!currentUser) return null;

    return (
        <div className="pt-4 w-full">
            
            <div className="flex justify-center mb-6 sm:mb-8">
                <nav aria-label="Sezioni della rete" className="bg-slate-100 p-1.5 rounded-2xl flex w-full sm:w-auto shadow-inner border border-slate-200">
                    <span className="flex-1 sm:flex-none justify-center px-3 sm:px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 bg-white text-corsia-700 shadow-sm" aria-current="page">
                        <Icon type="users" className="w-4 h-4 hidden min-[380px]:block" />
                        <span>Collegamenti</span>
                    </span>
                    <Link to="/gruppi" className="flex-1 sm:flex-none justify-center px-3 sm:px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 text-slate-500 hover:text-slate-700">
                        <Icon type="users" className="w-4 h-4 hidden min-[380px]:block" />
                        <span>Gruppi</span>
                    </Link>
                    <Link to="/eventi" className="flex-1 sm:flex-none justify-center px-3 sm:px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 text-slate-500 hover:text-slate-700">
                        <Icon type="calendar" className="w-4 h-4 hidden min-[380px]:block" />
                        <span>Eventi</span>
                    </Link>
                </nav>
            </div>

                <div className="animate-in fade-in duration-500">
                    <NetworkView 
                        currentUser={currentUser}
                        pendingRequests={pendingRequests}
                        suggestions={suggestions.filter((p) => !blocks.isHidden(p.userId || p.$id))}
                        activeConnections={activeConnections}
                        searchQuery={searchQuery}
                        setSearchQuery={setSearchQuery}
                        searchResults={{ ...searchResults, profiles: searchResults.profiles.filter((p) => !blocks.isHidden(p.userId || p.$id)) }}
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

        </div>
    );
};

export default Network;