import React, { useCallback, useEffect, useRef, useState } from 'react';
import { databaseService, type StaffChatMember, type StaffMessage } from '@/services/database';
import { useToast } from '@/context/ToastContext';
import { Icon } from '@/components/ui/Icon';
import { RichText } from '@/utils/richText';
import { initialsAvatar } from '@/utils/avatar';
import { useConfirm } from '@/context/ConfirmContext';
import { useSignal } from '@/hooks/useSignal';

/** Controllo di riserva: i nuovi messaggi arrivano subito con i segnali di tempo reale. */
const POLL_MS = 30000;

const dayLabel = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Oggi';
    if (d.toDateString() === new Date(Date.now() - 86_400_000).toDateString()) return 'Ieri';
    return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
};
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

/**
 * Chat dello staff di una struttura. I messaggi non hanno permessi per i client:
 * passano dalla Function, che a ogni lettura verifica che tu sia amministratore o staff.
 * I nuovi messaggi (e le eliminazioni) arrivano in tempo reale con i segnali della Function;
 * un controllo di riserva ogni 30 secondi copre le connessioni Realtime interrotte.
 */
export const StaffChat: React.FC<{ structureId: string; structureName: string; currentUserId: string; isAdmin: boolean; onRead?: () => void }> = ({ structureId, structureName, currentUserId, isAdmin, onRead }) => {
    const confirm = useConfirm();
    const { showToast } = useToast();
    const [messages, setMessages] = useState<StaffMessage[] | null>(null);
    const [members, setMembers] = useState<Map<string, StaffChatMember>>(new Map());
    const [hasMore, setHasMore] = useState(false);
    const [text, setText] = useState('');
    const [sending, setSending] = useState(false);
    const [loadingOlder, setLoadingOlder] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);
    const lastRef = useRef<string | null>(null);
    const stickToBottom = useRef(true);
    const onReadRef = useRef(onRead);
    onReadRef.current = onRead;

    const scrollDown = () => window.setTimeout(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, 30);

    const [version, setVersion] = useState(0);
    useEffect(() => {
        let alive = true;
        if (version === 0) setMessages(null);
        databaseService
            .listStaffMessages(structureId)
            .then((r) => {
                if (!alive) return;
                setMessages(r.messages);
                setHasMore(r.hasMore);
                setMembers(new Map((r.members || []).map((m) => [m.$id, m])));
                lastRef.current = r.messages[r.messages.length - 1]?.$createdAt || new Date(0).toISOString();
                onReadRef.current?.();
                scrollDown();
            })
            .catch((err) => {
                console.error('Chat staff:', err);
                if (alive) { setMessages([]); showToast(err instanceof Error ? err.message : 'Chat non disponibile.', 'error'); }
            });
        return () => { alive = false; };
    }, [structureId, version]); // eslint-disable-line react-hooks/exhaustive-deps

    const poll = useCallback(async () => {
        if (!lastRef.current || document.visibilityState !== 'visible') return;
        try {
            const r = await databaseService.listStaffMessages(structureId, { after: lastRef.current });
            if (!r.messages.length) return;
            lastRef.current = r.messages[r.messages.length - 1].$createdAt;
            setMessages((prev) => {
                const known = new Set((prev || []).map((m) => m.$id));
                return [...(prev || []), ...r.messages.filter((m) => !known.has(m.$id))];
            });
            onReadRef.current?.();
            if (stickToBottom.current) scrollDown();
        } catch (err) {
            console.warn('Chat staff (aggiornamento):', err);
        }
    }, [structureId]);

    // Tempo reale: un messaggio nuovo si aggiunge, un messaggio eliminato fa ricaricare l'elenco.
    useSignal(`staffchat:${structureId}`, (_t, kind) => (kind === 'deleteStaffMessage' ? setVersion((v) => v + 1) : void poll()), 100);

    useEffect(() => {
        const t = window.setInterval(poll, POLL_MS);
        const onVisible = () => document.visibilityState === 'visible' && poll();
        document.addEventListener('visibilitychange', onVisible);
        return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
    }, [poll]);

    const loadOlder = async () => {
        if (!messages?.length) return;
        setLoadingOlder(true);
        const el = listRef.current;
        const prevHeight = el?.scrollHeight || 0;
        try {
            const r = await databaseService.listStaffMessages(structureId, { before: messages[0].$createdAt });
            setMessages((prev) => [...r.messages, ...(prev || [])]);
            setHasMore(r.hasMore);
            window.setTimeout(() => { if (el) el.scrollTop = el.scrollHeight - prevHeight; }, 30);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Messaggi non caricati.', 'error');
        } finally {
            setLoadingOlder(false);
        }
    };

    const send = async () => {
        const content = text.trim();
        if (!content || sending) return;
        setSending(true);
        try {
            const saved = await databaseService.sendStaffMessage(structureId, content);
            setText('');
            setMessages((prev) => (prev?.some((m) => m.$id === saved.$id) ? prev : [...(prev || []), saved]));
            if (!lastRef.current || saved.$createdAt > lastRef.current) lastRef.current = saved.$createdAt;
            stickToBottom.current = true;
            scrollDown();
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Messaggio non inviato.', 'error');
        } finally {
            setSending(false);
        }
    };

    const remove = async (m: StaffMessage) => {
        if (!await confirm({ title: 'Eliminare il messaggio?', message: 'Sparisce per tutto lo staff.', confirmLabel: 'Elimina', tone: 'danger' })) return;
        try {
            await databaseService.deleteStaffMessage(m.$id);
            setMessages((prev) => (prev || []).filter((x) => x.$id !== m.$id));
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Eliminazione non riuscita.', 'error');
        }
    };

    return (
        <div className="flex flex-col h-[min(70vh,560px)] min-w-0">
            <div
                ref={listRef}
                className="flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-6 py-4 space-y-3 bg-piastrella/60"
                onScroll={(e) => { const el = e.currentTarget; stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}
                aria-live="polite"
            >
                {messages === null ? (
                    <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-300 border-t-corsia-600" /></div>
                ) : messages.length === 0 ? (
                    <div className="text-center py-12 px-4">
                        <Icon type="chat-bubble" className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                        <p className="font-semibold text-abisso">La chat dello staff di {structureName}</p>
                        <p className="text-sm text-slate-500 mt-1">Coordinatevi su turni, cambi e imprevisti. La vedono solo amministratori e staff.</p>
                    </div>
                ) : (
                    <>
                        {hasMore && (
                            <div className="flex justify-center">
                                <button onClick={loadOlder} disabled={loadingOlder} className="text-sm font-semibold text-corsia-700 hover:underline disabled:opacity-60">{loadingOlder ? 'Caricamento…' : 'Messaggi precedenti'}</button>
                            </div>
                        )}
                        {messages.map((m, i) => {
                            const mine = m.authorId === currentUserId;
                            const author = members.get(m.authorId);
                            const name = author?.name || 'Ex membro dello staff';
                            const prev = messages[i - 1];
                            const newDay = !prev || new Date(prev.$createdAt).toDateString() !== new Date(m.$createdAt).toDateString();
                            const grouped = !newDay && prev?.authorId === m.authorId && new Date(m.$createdAt).getTime() - new Date(prev.$createdAt).getTime() < 5 * 60_000;
                            return (
                                <React.Fragment key={m.$id}>
                                    {newDay && (
                                        <div className="flex justify-center py-1">
                                            <span className="inline-block first-letter:uppercase text-xs font-semibold text-slate-500 bg-white border border-slate-200 rounded-full px-3 py-1">{dayLabel(m.$createdAt)}</span>
                                        </div>
                                    )}
                                    <div className={`group flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'} ${grouped ? '-mt-2' : ''}`}>
                                        {!mine && (
                                            <div className="w-8 flex-shrink-0">
                                                {!grouped && <img src={author?.avatar || initialsAvatar(name)} alt="" className="w-8 h-8 rounded-full object-cover bg-white" />}
                                            </div>
                                        )}
                                        {(mine || isAdmin) && (
                                            <button
                                                onClick={() => remove(m)}
                                                aria-label="Elimina il messaggio"
                                                className={`self-center p-1.5 rounded-full text-slate-400 hover:text-galleggiante-700 hover:bg-white sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 ${mine ? 'order-first' : 'order-last'}`}
                                            >
                                                <Icon type="trash" className="w-4 h-4" />
                                            </button>
                                        )}
                                        <div className={`min-w-0 max-w-[85%] sm:max-w-md rounded-2xl px-3.5 py-2 shadow-sm ${mine ? 'bg-corsia-600 text-white rounded-br-sm' : 'bg-white text-slate-800 border border-slate-100 rounded-bl-sm'}`}>
                                            {!mine && !grouped && (
                                                <p className="text-xs font-semibold text-corsia-700 mb-0.5 flex items-center gap-1.5">
                                                    {name}
                                                    {author?.role === 'admin' && <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 rounded-full px-1.5 py-px">Amministrazione</span>}
                                                </p>
                                            )}
                                            <p className="text-[15px] whitespace-pre-wrap break-words leading-relaxed"><RichText text={m.content} inverse={mine} /></p>
                                            <p className={`text-[11px] text-right mt-0.5 ${mine ? 'text-blue-100' : 'text-slate-400'}`}>{timeOf(m.$createdAt)}</p>
                                        </div>
                                    </div>
                                </React.Fragment>
                            );
                        })}
                    </>
                )}
            </div>
            <div className="p-3 border-t border-slate-100 bg-white">
                <div className="flex items-end gap-2 bg-slate-50 rounded-3xl border border-slate-200 focus-within:border-corsia-400 focus-within:ring-2 focus-within:ring-corsia-100 p-1.5">
                    <label htmlFor={`staff-chat-${structureId}`} className="sr-only">Scrivi allo staff</label>
                    <textarea
                        id={`staff-chat-${structureId}`}
                        rows={1}
                        value={text}
                        maxLength={2000}
                        onChange={(e) => setText(e.target.value)}
                        onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = `${Math.min(t.scrollHeight, 128)}px`; }}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                        placeholder="Scrivi allo staff…"
                        className="flex-1 bg-transparent resize-none px-3 py-2 focus:outline-none text-[15px] max-h-32 min-w-0"
                    />
                    <button onClick={send} disabled={!text.trim() || sending} aria-label="Invia" className="bg-corsia-600 text-white rounded-full p-2.5 hover:bg-corsia-700 disabled:bg-slate-300">
                        {sending ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Icon type="send" className="w-5 h-5" />}
                    </button>
                </div>
                <p className="text-xs text-slate-400 mt-1.5 px-2">Visibile solo ad amministratori e staff di {structureName}.</p>
            </div>
        </div>
    );
};
