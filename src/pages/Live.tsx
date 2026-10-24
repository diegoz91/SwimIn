import React, { useState, useEffect, useCallback } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/hooks/useAuth';
import { databaseService } from '@/services/database';
import { client } from '@/services/appwrite';
import { APPWRITE_CONFIG } from '@/config/constants';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/context/ToastContext';
import { LiveRoomView } from '@/features/live/LiveRoomView';
import { avatarOf, displayNameOf } from '@/utils/profile';
import { formatRelativeTime } from '@/utils/format';
import type { LiveRoom, StructureProfile, UserProfile } from '@/types/types';

const IDEAS = [
    'Domande e risposte sul brevetto di assistente bagnanti',
    'Didattica per i corsi dei più piccoli',
    'Preparare la stagione estiva in piscina scoperta',
];

/** Bordo vasca live: stanze di confronto in tempo reale tra professionisti. */
const Live: React.FC = () => {
    usePageTitle('Bordo vasca live');
    const { user } = useAuth();
    const { showToast } = useToast();

    const [rooms, setRooms] = useState<LiveRoom[]>([]);
    const [hosts, setHosts] = useState<Record<string, UserProfile | StructureProfile>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [busy, setBusy] = useState(false);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);

    const fetchRooms = useCallback(async () => {
        try {
            const active = await databaseService.getActiveLiveRooms();
            setRooms(active);
            if (user && !currentRoomId) {
                const mine = active.find((r) => r.hostId === user.$id || (r.speakers || []).includes(user.$id) || (r.listeners || []).includes(user.$id));
                if (mine) setCurrentRoomId(mine.$id);
            }
            const hostIds = [...new Set(active.map((r) => r.hostId))];
            if (hostIds.length) {
                const list = await databaseService.getConnectionsProfiles(hostIds);
                setHosts(Object.fromEntries(list.map((p) => [p.$id, p])));
            }
        } catch (error) {
            console.error('Stanze live:', error);
        } finally {
            setIsLoading(false);
        }
    }, [user, currentRoomId]);

    useEffect(() => {
        fetchRooms();
        const channel = `databases.${APPWRITE_CONFIG.databaseId}.collections.${APPWRITE_CONFIG.collections.live_rooms}.documents`;
        const unsubscribe = client.subscribe(channel, () => fetchRooms());
        return () => unsubscribe();
    }, [fetchRooms]);

    const currentRoom = rooms.find((r) => r.$id === currentRoomId) || null;

    // La stanza è stata chiusa dall'host mentre eravamo dentro.
    useEffect(() => {
        if (currentRoomId && !isLoading && !currentRoom) {
            setCurrentRoomId(null);
            showToast('La diretta è terminata.', 'info');
        }
    }, [currentRoomId, currentRoom, isLoading, showToast]);

    const createRoom = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;
        setBusy(true);
        try {
            const room = await databaseService.createLiveRoom({ title: title.trim(), description: description.trim() });
            setRooms((prev) => [room, ...prev]);
            setCurrentRoomId(room.$id);
            setIsCreating(false);
            setTitle('');
            setDescription('');
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Non è stato possibile aprire la diretta.', 'error');
        } finally {
            setBusy(false);
        }
    };

    const joinRoom = async (roomId: string) => {
        if (!user) return;
        setBusy(true);
        const joined = await databaseService.joinLiveRoom(roomId, user.$id, 'listener');
        setBusy(false);
        if (joined) {
            setRooms((prev) => prev.map((r) => (r.$id === joined.$id ? joined : r)));
            setCurrentRoomId(joined.$id);
        } else {
            showToast('La diretta non è più disponibile.', 'error');
        }
    };

    const leaveRoom = async () => {
        if (!user || !currentRoom) return;
        if (currentRoom.hostId === user.$id) {
            if (!window.confirm('Chiudere la diretta per tutti i partecipanti?')) return;
            try {
                await databaseService.endLiveRoom(currentRoom.$id);
                showToast('Diretta chiusa.', 'info');
            } catch (err) {
                showToast(err instanceof Error ? err.message : 'Non è stato possibile chiudere la diretta.', 'error');
                return;
            }
        } else {
            await databaseService.leaveLiveRoom(currentRoom.$id, user.$id);
        }
        setCurrentRoomId(null);
        fetchRooms();
    };

    if (!user) return null;
    if (currentRoom) return <LiveRoomView room={currentRoom} user={user} onLeave={leaveRoom} />;

    return (
        <div className="pt-4 max-w-5xl mx-auto w-full">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-4xl font-bold text-abisso leading-none">Bordo vasca live</h1>
                    <p className="text-slate-600 mt-2 max-w-xl">
                        Stanze di confronto in tempo reale: chi conduce porta sul palco gli ospiti, il pubblico interviene in chat con domande e mani alzate.
                    </p>
                </div>
                {!isCreating && (
                    <button onClick={() => setIsCreating(true)} className="px-5 py-3 rounded-full font-semibold text-white bg-corsia-600 hover:bg-corsia-700 flex items-center justify-center gap-2">
                        <Icon type="plus" className="w-5 h-5" /> Apri una stanza
                    </button>
                )}
            </div>

            {isCreating && (
                <form onSubmit={createRoom} className="bg-white rounded-3xl border border-slate-200 shadow-card p-6 mb-8 space-y-4 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between">
                        <h2 className="text-2xl font-bold text-abisso">Nuova stanza</h2>
                        <button type="button" onClick={() => setIsCreating(false)} className="p-2 text-slate-400 hover:text-abisso rounded-full" aria-label="Annulla">
                            <Icon type="x" className="w-5 h-5" />
                        </button>
                    </div>
                    <div>
                        <label htmlFor="live-title" className="block text-sm font-semibold text-slate-700 mb-1.5">Argomento</label>
                        <input id="live-title" required autoFocus maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-corsia-200 focus:border-corsia-400 outline-none" placeholder={IDEAS[0]} />
                        <div className="flex flex-wrap gap-2 mt-2">
                            {IDEAS.map((idea) => (
                                <button key={idea} type="button" onClick={() => setTitle(idea)} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-piastrella text-slate-600 hover:text-abisso">
                                    {idea}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label htmlFor="live-desc" className="block text-sm font-semibold text-slate-700 mb-1.5">Descrizione (facoltativa)</label>
                        <textarea id="live-desc" rows={2} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-corsia-200 focus:border-corsia-400 outline-none" />
                    </div>
                    <button type="submit" disabled={busy || !title.trim()} className="w-full sm:w-auto px-6 py-3 rounded-full font-semibold text-white bg-galleggiante hover:bg-red-700 disabled:opacity-50">
                        {busy ? 'Apertura…' : 'Vai in diretta'}
                    </button>
                </form>
            )}

            <h2 className="text-2xl font-bold text-abisso mb-4">In corso adesso</h2>
            {isLoading ? (
                <div className="grid md:grid-cols-2 gap-4" aria-hidden="true">
                    {[0, 1].map((i) => <div key={i} className="h-44 bg-white rounded-3xl border border-slate-200 animate-pulse" />)}
                </div>
            ) : rooms.length === 0 ? (
                <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-10 text-center">
                    <Icon type="video" className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                    <p className="font-semibold text-abisso">Nessuna stanza aperta in questo momento.</p>
                    <p className="text-slate-500 mt-1">Apri tu la prima: un dubbio sui brevetti, una tecnica, l’organizzazione dei turni.</p>
                </div>
            ) : (
                <div className="grid md:grid-cols-2 gap-4">
                    {rooms.map((room) => {
                        const host = hosts[room.hostId];
                        const people = (room.speakers?.length || 0) + (room.listeners?.length || 0);
                        return (
                            <article key={room.$id} className="bg-white rounded-3xl border border-slate-200 shadow-card overflow-hidden flex flex-col">
                                <div className="lane-rope" aria-hidden="true" />
                                <div className="p-5 flex-1">
                                    <p className="flex items-center gap-2 text-xs font-semibold text-galleggiante">
                                        <span className="w-2 h-2 rounded-full bg-galleggiante motion-safe:animate-pulse" aria-hidden="true" />
                                        In diretta · {people} {people === 1 ? 'partecipante' : 'partecipanti'} · da {formatRelativeTime(room.startedAt || room.$createdAt).replace(' fa', '')}
                                    </p>
                                    <h3 className="mt-2 text-xl font-semibold text-abisso leading-snug">{room.title}</h3>
                                    {room.description && <p className="text-sm text-slate-600 mt-1 line-clamp-2">{room.description}</p>}
                                    <div className="flex items-center gap-2 mt-4">
                                        <img src={avatarOf(host)} alt="" className="w-8 h-8 rounded-full object-cover" />
                                        <span className="text-sm text-slate-600">Conduce <span className="font-semibold text-abisso">{displayNameOf(host)}</span></span>
                                    </div>
                                </div>
                                <button onClick={() => joinRoom(room.$id)} disabled={busy} className="m-5 mt-0 py-3 rounded-full font-semibold text-corsia-700 bg-corsia-50 hover:bg-corsia-100 disabled:opacity-60">
                                    Entra nella stanza
                                </button>
                            </article>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default Live;
