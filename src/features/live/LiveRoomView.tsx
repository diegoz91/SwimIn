import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Checkbox } from '@/components/form/Field';
import { Link } from 'react-router-dom';
import { client } from '@/services/appwrite';
import { APPWRITE_CONFIG } from '@/config/constants';
import { databaseService } from '@/services/database';
import { useToast } from '@/context/ToastContext';
import { Icon } from '@/components/ui/Icon';
import { avatarOf, displayNameOf, headlineOf } from '@/utils/profile';
import { formatRelativeTime } from '@/utils/format';
import type { AuthenticatedUser, LiveMessage, LiveRoom, StructureProfile, UserProfile } from '@/types/types';

type Profile = UserProfile | StructureProfile;

interface LiveRoomViewProps {
    room: LiveRoom;
    user: AuthenticatedUser;
    onLeave: () => void;
}

/**
 * Stanza "Bordo Vasca": palco con host e relatori, pubblico, e chat in tempo
 * reale con domande e mani alzate. L'host invita le persone sul palco.
 */
export const LiveRoomView: React.FC<LiveRoomViewProps> = ({ room: initialRoom, user, onLeave }) => {
    const { showToast } = useToast();
    const [room, setRoom] = useState(initialRoom);
    const [messages, setMessages] = useState<LiveMessage[]>([]);
    const [profiles, setProfiles] = useState<Record<string, Profile>>({});
    const [text, setText] = useState('');
    const [asQuestion, setAsQuestion] = useState(false);
    const [sending, setSending] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);

    const isHost = room.hostId === user.$id;
    const participantIds = useMemo(
        () => [...new Set([room.hostId, ...(room.speakers || []), ...(room.listeners || []), ...messages.map((m) => m.authorId)])],
        [room, messages]
    );

    useEffect(() => setRoom(initialRoom), [initialRoom]);

    // Profili dei partecipanti (caricati solo quelli mancanti).
    useEffect(() => {
        const missing = participantIds.filter((id) => !profiles[id]);
        if (missing.length === 0) return;
        databaseService.getConnectionsProfiles(missing).then((list) =>
            setProfiles((prev) => ({ ...prev, ...Object.fromEntries(list.map((p) => [p.$id, p])) }))
        );
    }, [participantIds, profiles]);

    // Chat iniziale + messaggi nuovi in tempo reale.
    useEffect(() => {
        databaseService.getLiveMessages(room.$id).then(setMessages).catch((e) => console.warn('Chat non disponibile:', e));
        const channel = `databases.${APPWRITE_CONFIG.databaseId}.collections.${APPWRITE_CONFIG.collections.live_messages}.documents`;
        const unsubscribe = client.subscribe(channel, (event) => {
            const msg = event.payload as LiveMessage;
            if (msg?.roomId !== room.$id) return;
            setMessages((prev) => (prev.some((m) => m.$id === msg.$id) ? prev : [...prev, msg]));
        });
        return () => unsubscribe();
    }, [room.$id]);

    useEffect(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages.length]);

    const send = async (kind: LiveMessage['kind'], content = '') => {
        setSending(true);
        try {
            const msg = await databaseService.sendLiveMessage(room.$id, content, kind);
            setMessages((prev) => (prev.some((m) => m.$id === msg.$id) ? prev : [...prev, msg]));
            if (kind !== 'hand') setText('');
            else showToast('Hai alzato la mano: l’host può invitarti sul palco.', 'info');
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Messaggio non inviato.', 'error');
        } finally {
            setSending(false);
        }
    };

    const setStage = async (userId: string, onStage: boolean) => {
        try {
            setRoom(await databaseService.setLiveSpeaker(room.$id, userId, onStage));
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'Operazione non riuscita.', 'error');
        }
    };

    const speakers = [room.hostId, ...(room.speakers || []).filter((id) => id !== room.hostId)];
    const listeners = (room.listeners || []).filter((id) => !speakers.includes(id));
    // Mani alzate di chi è ancora tra il pubblico (l'ultima per persona).
    const raisedHands = [...new Set(messages.filter((m) => m.kind === 'hand').map((m) => m.authorId))].filter((id) => listeners.includes(id));
    const questions = messages.filter((m) => m.kind === 'question');

    const Person: React.FC<{ id: string; size?: 'lg' | 'sm' }> = ({ id, size = 'lg' }) => {
        const p = profiles[id];
        return size === 'lg' ? (
            <div className="text-center">
                <div className="relative w-fit mx-auto">
                    <img src={avatarOf(p)} alt="" className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover ring-4 ring-white/10" />
                    {id === room.hostId && (
                        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-cloro-500 text-abisso text-[10px] font-bold px-2 py-0.5 rounded-full">Host</span>
                    )}
                </div>
                <Link to={`/profile/${id}`} className="block mt-2 text-sm font-semibold text-white hover:underline truncate">{displayNameOf(p)}</Link>
                <p className="text-xs text-corsia-200 truncate">{headlineOf(p)}</p>
                {isHost && id !== room.hostId && (
                    <button onClick={() => setStage(id, false)} className="mt-1 text-xs font-semibold text-corsia-200 hover:text-white">
                        Riporta tra il pubblico
                    </button>
                )}
            </div>
        ) : (
            <Link to={`/profile/${id}`} title={displayNameOf(p)}>
                <img src={avatarOf(p)} alt={displayNameOf(p)} className="w-9 h-9 rounded-full object-cover ring-2 ring-white/10" />
            </Link>
        );
    };

    return (
        <div className="pt-4 grid lg:grid-cols-[minmax(0,1fr)_24rem] gap-4 animate-in fade-in duration-300">
            <section className="bg-abisso text-white rounded-3xl overflow-hidden flex flex-col" aria-labelledby="live-title">
                <div className="lane-rope" aria-hidden="true" />
                <div className="p-5 sm:p-7 flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-white/10">
                    <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm text-corsia-200">
                            <span className="w-2.5 h-2.5 rounded-full bg-galleggiante motion-safe:animate-pulse" aria-hidden="true" />
                            In diretta da {formatRelativeTime(room.startedAt || room.$createdAt).replace(' fa', '')}
                            <span aria-hidden="true">·</span>
                            {speakers.length + listeners.length} partecipanti
                        </p>
                        <h1 id="live-title" className="text-3xl sm:text-4xl font-bold mt-2 leading-none">{room.title}</h1>
                        {room.description && <p className="mt-3 text-corsia-100 max-w-2xl">{room.description}</p>}
                    </div>
                    <button onClick={onLeave} className="flex-shrink-0 px-5 py-2.5 rounded-full font-semibold bg-white/10 hover:bg-galleggiante transition">
                        {isHost ? 'Chiudi la diretta' : 'Esci'}
                    </button>
                </div>

                <div className="p-5 sm:p-7">
                    <h2 className="text-lg font-bold text-corsia-100">Sul palco</h2>
                    <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-6">
                        {speakers.map((id) => <Person key={id} id={id} />)}
                    </div>
                </div>

                {isHost && raisedHands.length > 0 && (
                    <div className="mx-5 sm:mx-7 mb-5 rounded-2xl bg-white/5 p-4">
                        <h2 className="text-lg font-bold text-corsia-100">Mani alzate</h2>
                        <ul className="mt-2 space-y-2">
                            {raisedHands.map((id) => (
                                <li key={id} className="flex items-center gap-3">
                                    <img src={avatarOf(profiles[id])} alt="" className="w-8 h-8 rounded-full object-cover" />
                                    <span className="flex-1 text-sm truncate">{displayNameOf(profiles[id])}</span>
                                    <button onClick={() => setStage(id, true)} className="px-3 py-1.5 rounded-full text-sm font-semibold bg-cloro-500 text-abisso hover:bg-cloro-400">
                                        Invita sul palco
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <div className="mt-auto p-5 sm:p-7 border-t border-white/10">
                    <h2 className="text-sm font-semibold text-corsia-200 mb-3">Pubblico · {listeners.length}</h2>
                    {listeners.length === 0 ? (
                        <p className="text-sm text-corsia-200/80">Ancora nessuno in ascolto. Condividi la stanza con i tuoi colleghi.</p>
                    ) : (
                        <div className="flex flex-wrap gap-2">{listeners.map((id) => <Person key={id} id={id} size="sm" />)}</div>
                    )}
                </div>
            </section>

            <section className="bg-white rounded-3xl border border-slate-200 shadow-card flex flex-col h-[70vh] lg:h-[calc(100dvh-7.5rem)] lg:sticky lg:top-4" aria-label="Chat della diretta">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-abisso">Chat</h2>
                    {questions.length > 0 && <span className="text-xs font-semibold text-corsia-700">{questions.length} domande</span>}
                </div>
                <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3" aria-live="polite">
                    {messages.length === 0 && <p className="text-sm text-slate-500 text-center py-8">Scrivi il primo messaggio o fai una domanda a chi è sul palco.</p>}
                    {messages.map((m) => {
                        const p = profiles[m.authorId];
                        if (m.kind === 'hand') {
                            return (
                                <p key={m.$id} className="text-xs text-slate-500 text-center">
                                    {displayNameOf(p)} ha alzato la mano
                                </p>
                            );
                        }
                        return (
                            <div key={m.$id} className="flex gap-2.5">
                                <img src={avatarOf(p)} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                                <div className="min-w-0">
                                    <p className="text-xs text-slate-500">
                                        <span className="font-semibold text-abisso">{displayNameOf(p)}</span>
                                        {m.authorId === room.hostId && <span className="ml-1 text-cloro-700 font-semibold">host</span>}
                                    </p>
                                    <p className={`text-sm mt-0.5 break-words ${m.kind === 'question' ? 'bg-corsia-50 border border-corsia-100 rounded-xl px-3 py-2 text-abisso' : 'text-slate-700'}`}>
                                        {m.kind === 'question' && <span className="block text-xs font-semibold text-corsia-700 mb-0.5">Domanda</span>}
                                        {m.content}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (text.trim()) send(asQuestion ? 'question' : 'message', text.trim());
                    }}
                    className="p-3 border-t border-slate-100 space-y-2"
                >
                    <div className="flex gap-2">
                        <label htmlFor="live-msg" className="sr-only">Messaggio</label>
                        <input
                            id="live-msg"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            maxLength={1000}
                            placeholder={asQuestion ? 'Scrivi la tua domanda…' : 'Scrivi un messaggio…'}
                            className="flex-1 min-w-0 px-4 py-2.5 rounded-full bg-piastrella border border-transparent focus:bg-white focus:border-corsia-300 outline-none text-sm"
                        />
                        <button type="submit" disabled={!text.trim() || sending} aria-label="Invia" className="w-10 h-10 rounded-full bg-corsia-600 text-white flex items-center justify-center disabled:opacity-50">
                            <Icon type="paper-plane" className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="flex items-center justify-between">
                        <Checkbox id="live-question" checked={asQuestion} onChange={setAsQuestion} label="È una domanda" />
                        {!isHost && !speakers.includes(user.$id) && (
                            <button type="button" onClick={() => send('hand')} disabled={sending} className="text-sm font-semibold text-corsia-700 hover:text-corsia-900">
                                ✋ Alza la mano
                            </button>
                        )}
                    </div>
                </form>
            </section>
        </div>
    );
};
