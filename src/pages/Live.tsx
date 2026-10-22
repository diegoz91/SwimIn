import React, { useState, useEffect, useCallback } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/hooks/useAuth';
import { databaseService } from '@/services/database';
import { client } from '@/services/appwrite';
import { APPWRITE_CONFIG } from '@/config/constants';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/context/ToastContext';
import type { LiveRoom } from '@/types/types';

const Live: React.FC = () => {
    usePageTitle('Bordo Vasca Live');
    const { user } = useAuth();
    const { showToast } = useToast();
    
    // Stati della Lobby
    const [activeRooms, setActiveRooms] = useState<LiveRoom[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // Stati per la creazione di una nuova stanza
    const [isCreating, setIsCreating] = useState(false);
    const [newRoomTitle, setNewRoomTitle] = useState('');
    const [newRoomDesc, setNewRoomDesc] = useState('');
    
    // Stato della stanza corrente
    const [currentRoom, setCurrentRoom] = useState<LiveRoom | null>(null);
    const [myRole, setMyRole] = useState<'host' | 'speaker' | 'listener' | null>(null);

    // 1. CARICA LA LOBBY E ASCOLTA IN REAL-TIME
    const fetchRooms = useCallback(async () => {
        try {
            const rooms = await databaseService.getActiveLiveRooms();
            setActiveRooms(rooms);
            
            if (user) {
                const myActiveRoom = rooms.find(r => 
                    r.hostId === user.$id || 
                    (r.speakers || []).includes(user.$id) || 
                    (r.listeners || []).includes(user.$id)
                );
                if (myActiveRoom) {
                    setCurrentRoom(myActiveRoom);
                    if (myActiveRoom.hostId === user.$id) setMyRole('host');
                    else if ((myActiveRoom.speakers || []).includes(user.$id)) setMyRole('speaker');
                    else setMyRole('listener');
                }
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    useEffect(() => {
        fetchRooms();

        const liveRoomsCol = (APPWRITE_CONFIG.collections as any).live_rooms || 'live_rooms';
        const channel = `databases.${APPWRITE_CONFIG.databaseId}.collections.${liveRoomsCol}.documents`;
        
        const unsubscribe = client.subscribe(channel, (response: any) => {
            fetchRooms();
        });

        return () => unsubscribe();
    }, [fetchRooms]);

    // 2. CREA UNA NUOVA STANZA
    const handleCreateRoom = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !newRoomTitle.trim()) return;
        
        setIsLoading(true);
        const room = await databaseService.createLiveRoom({
            title: newRoomTitle,
            description: newRoomDesc,
            hostId: user.$id,
        });

        if (room) {
            showToast('Stanza creata con successo! Sei Live.', 'success');
            setCurrentRoom(room);
            setMyRole('host');
            setIsCreating(false);
            setNewRoomTitle('');
            setNewRoomDesc('');
        } else {
            showToast('Errore durante la creazione della stanza.', 'error');
        }
        setIsLoading(false);
    };

    // 3. ENTRA IN UNA STANZA
    const handleJoinRoom = async (roomId: string) => {
        if (!user) return;
        setIsLoading(true);
        const joinedRoom = await databaseService.joinLiveRoom(roomId, user.$id, 'listener');
        if (joinedRoom) {
            setCurrentRoom(joinedRoom);
            setMyRole('listener');
            showToast('Sei entrato nella stanza in ascolto.', 'info');
        } else {
            showToast('Impossibile entrare nella stanza. Forse è stata chiusa.', 'error');
        }
        setIsLoading(false);
    };

    // 4. ESCI O CHIUDI LA STANZA
    const handleLeaveRoom = async () => {
        if (!user || !currentRoom) return;
        
        if (myRole === 'host') {
            await databaseService.endLiveRoom(currentRoom.$id);
            showToast('Hai terminato la diretta per tutti.', 'info');
        } else {
            await databaseService.leaveLiveRoom(currentRoom.$id, user.$id);
            showToast('Sei uscito dalla stanza.', 'info');
        }
        setCurrentRoom(null);
        setMyRole(null);
    };

    if (!user) return null;

    // ==========================================
    // INTERFACCIA 1: STANZA LIVE
    // ==========================================
    if (currentRoom) {
        const totalParticipants = (currentRoom.speakers?.length || 0) + (currentRoom.listeners?.length || 0);

        return (
            <div className="max-w-4xl mx-auto w-full animate-in zoom-in-95 duration-500">
                <div className="bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-slate-800 text-white relative">
                    
                    {/* Header Stanza */}
                    <div className="p-6 sm:p-8 border-b border-slate-800 bg-slate-900/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <span className="flex items-center gap-1.5 bg-red-500/20 text-red-500 px-3 py-1 rounded-full text-xs font-bold border border-red-500/30">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                    </span>
                                    ON AIR
                                </span>
                                <span className="text-slate-400 text-sm font-medium flex items-center gap-1">
                                    <Icon type="users" className="w-4 h-4" /> {totalParticipants} Partecipanti
                                </span>
                            </div>
                            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{currentRoom.title}</h1>
                            {currentRoom.description && (
                                <p className="text-slate-400 mt-2 text-sm">{currentRoom.description}</p>
                            )}
                        </div>

                        <button 
                            onClick={handleLeaveRoom}
                            className="bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-3 rounded-xl transition-all shadow-lg active:scale-95 flex items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                        >
                            <Icon type="logout" className="w-5 h-5" />
                            {myRole === 'host' ? 'Termina Diretta' : 'Esci'}
                        </button>
                    </div>

                    {/* Palco */}
                    <div className="p-6 sm:p-8 bg-slate-800/30">
                        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Sul Palco</h2>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            {/* Placeholder per l'Host */}
                            <div className="bg-slate-800 rounded-2xl p-4 text-center border-2 border-blue-500/30 relative">
                                <div className="absolute -top-3 -right-3 bg-blue-500 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-md">HOST</div>
                                <div className="w-16 h-16 bg-blue-100 rounded-full mx-auto mb-3 flex items-center justify-center shadow-inner">
                                    <Icon type="star" className="w-8 h-8 text-blue-600" />
                                </div>
                                <p className="font-bold text-sm truncate text-slate-200">Host Room</p>
                                <Icon type="video" className="w-4 h-4 text-green-400 mx-auto mt-2 animate-pulse" />
                            </div>

                            {/* Altri Speakers */}
                            {(currentRoom.speakers || []).filter(id => id !== currentRoom.hostId).map(speakerId => (
                                <div key={speakerId} className="bg-slate-800 rounded-2xl p-4 text-center border border-slate-700">
                                    <div className="w-16 h-16 bg-slate-700 rounded-full mx-auto mb-3 flex items-center justify-center">
                                        <Icon type="user" className="w-8 h-8 text-slate-400" />
                                    </div>
                                    <p className="font-bold text-sm truncate text-slate-300">Speaker</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Platea */}
                    <div className="p-6 sm:p-8">
                        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                            In Ascolto <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full text-xs">{(currentRoom.listeners || []).length}</span>
                        </h2>
                        <div className="flex flex-wrap gap-3">
                            {(currentRoom.listeners || []).length === 0 ? (
                                <p className="text-sm text-slate-500 italic">Nessun ascoltatore al momento.</p>
                            ) : (
                                (currentRoom.listeners || []).map(listenerId => (
                                    <div key={listenerId} className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center border border-slate-700 tooltip-trigger">
                                        <Icon type="user" className="w-5 h-5 text-slate-500" />
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Controlli Inferiori Placeholder (Per la futura integrazione WebRTC) */}
                    <div className="border-t border-slate-800 p-4 bg-slate-950 flex justify-center gap-4">
                        <button className="p-4 rounded-full bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors tooltip-trigger" title="Prossimamente: Attiva/Disattiva Mic">
                            <Icon type="chat-bubble" className="w-6 h-6" />
                        </button>
                        <button className="p-4 rounded-full bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors tooltip-trigger" title="Prossimamente: Attiva/Disattiva Cam">
                            <Icon type="camera" className="w-6 h-6" />
                        </button>
                        <button className="p-4 rounded-full bg-slate-800 text-slate-400 hover:text-blue-400 hover:bg-blue-900/30 transition-colors tooltip-trigger" title="Prossimamente: Alza la mano">
                            <Icon type="thumb-up" className="w-6 h-6" />
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ==========================================
    // INTERFACCIA 2: LOBBY
    // ==========================================
    return (
        <div className="max-w-5xl mx-auto w-full animate-in fade-in duration-500 pb-20">
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-800 flex items-center gap-3">
                        Bordo Vasca Live
                        <span className="bg-red-100 text-red-600 text-[10px] uppercase tracking-wider px-2 py-1 rounded-md font-black border border-red-200">Beta</span>
                    </h1>
                    <p className="text-slate-500 mt-1">Unisciti alle stanze audio/video per discutere, imparare e fare networking.</p>
                </div>
                <button 
                    onClick={() => setIsCreating(true)}
                    className="w-full md:w-auto bg-blue-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-blue-700 transition-colors shadow-sm flex items-center justify-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                    <Icon type="video" className="w-5 h-5" /> Avvia una Stanza
                </button>
            </div>

            {/* Modal Creazione Stanza */}
            {isCreating && (
                <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-blue-200 mb-8 animate-in slide-in-from-top-4 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-blue-600"></div>
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-extrabold text-slate-800">Crea la tua Live Room</h2>
                        <button onClick={() => setIsCreating(false)} className="text-slate-400 hover:text-slate-700 p-2 rounded-full hover:bg-slate-100 transition-colors">
                            <Icon type="x" className="w-5 h-5" />
                        </button>
                    </div>
                    <form onSubmit={handleCreateRoom} className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">Argomento della stanza *</label>
                            <input 
                                required 
                                autoFocus
                                maxLength={100}
                                placeholder="Es. Q&A per la nuova stagione estiva, Masterclass Nuoto..." 
                                value={newRoomTitle} 
                                onChange={e => setNewRoomTitle(e.target.value)} 
                                className="w-full p-4 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white transition-colors text-lg font-medium" 
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">Descrizione (Opzionale)</label>
                            <textarea 
                                placeholder="Di cosa parleremo?" 
                                value={newRoomDesc} 
                                onChange={e => setNewRoomDesc(e.target.value)} 
                                className="w-full p-4 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white transition-colors resize-none" 
                                rows={2}
                            />
                        </div>
                        <div className="pt-2">
                            <button type="submit" disabled={isLoading || !newRoomTitle.trim()} className="w-full bg-blue-600 text-white font-extrabold py-4 rounded-xl shadow-md hover:bg-blue-700 hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-lg">
                                {isLoading ? 'Avvio in corso...' : <><Icon type="video" className="w-6 h-6" /> Vai Live Ora</>}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Griglia Stanze Attive */}
            <div>
                <h2 className="text-lg font-extrabold text-slate-800 mb-4 flex items-center gap-2">
                    <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                    </span>
                    Stanze in corso ({activeRooms.length})
                </h2>

                {isLoading ? (
                    <div className="flex justify-center py-20">
                        <div className="animate-spin rounded-full h-10 w-10 border-4 border-slate-200 border-t-red-500"></div>
                    </div>
                ) : activeRooms.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {activeRooms.map(room => (
                            <div key={room.$id} className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 hover:shadow-lg transition-shadow group flex flex-col justify-between h-full relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-red-50 to-transparent rounded-bl-full opacity-50 -z-10"></div>
                                
                                <div>
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="bg-red-50 text-red-600 text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-md border border-red-100 flex items-center gap-1.5">
                                            <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></div> Live
                                        </div>
                                        <div className="text-xs text-slate-400 font-bold flex items-center gap-1">
                                            <Icon type="users" className="w-4 h-4" /> {(room.speakers?.length || 0) + (room.listeners?.length || 0)}
                                        </div>
                                    </div>
                                    
                                    <h3 className="font-extrabold text-xl text-slate-800 mb-2 leading-tight group-hover:text-blue-600 transition-colors">
                                        {room.title}
                                    </h3>
                                    
                                    <div className="flex items-center gap-3 mt-4">
                                        <div className="flex -space-x-3">
                                            {(room.speakers || []).slice(0, 3).map((speakerId, idx) => (
                                                <div key={idx} className="w-8 h-8 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center z-10">
                                                    <Icon type="user" className="w-4 h-4 text-slate-500" />
                                                </div>
                                            ))}
                                        </div>
                                        <span className="text-xs font-semibold text-slate-500">
                                            {room.speakers?.length} Speaker
                                        </span>
                                    </div>
                                </div>

                                <button 
                                    onClick={() => handleJoinRoom(room.$id)}
                                    className="w-full mt-6 bg-slate-50 hover:bg-red-50 text-slate-700 hover:text-red-600 font-bold py-3 rounded-xl border border-slate-200 hover:border-red-200 transition-all flex items-center justify-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                                >
                                    Entra nella stanza
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="bg-white rounded-3xl p-12 text-center shadow-sm border border-slate-200 border-dashed">
                        <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
                            <Icon type="video" className="w-10 h-10 text-slate-300" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-800 mb-2">Nessuna stanza attiva</h3>
                        <p className="text-slate-500 max-w-sm mx-auto">Non c'è nessuno a bordo vasca in questo momento. Perché non rompi il ghiaccio e ne avvii una tu?</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Live;