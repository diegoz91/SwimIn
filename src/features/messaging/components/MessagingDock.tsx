import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { databaseService } from '@/services/database';
import type { StructureProfile, UserProfile } from '@/types/types';
import { Icon } from '@/components/ui/Icon';
import { avatarOf, displayNameOf, headlineOf } from '@/utils/profile';
import { formatRelativeTime } from '@/utils/format';
import { ChatWindow } from './ChatWindow';
import { useConversations } from '../useConversations';
import { conversationIdOf, filterConversations, type Conversation } from '../conversations';
import { OPEN_CHAT_EVENT } from '../openChat';
import { closeWindow, maxWindowsFor, openWindow, readDock, saveDock, toggleWindow, type DockState } from '../dockState';

type Profile = UserProfile | StructureProfile;

const iconBtn = 'w-8 h-8 grid place-items-center rounded-full text-slate-600 hover:bg-slate-100 hover:text-abisso outline-hidden focus-visible:ring-2 focus-visible:ring-corsia-500';

const Avatar: React.FC<{ p: Profile; size?: string; online?: boolean }> = ({ p, size = 'w-12 h-12', online }) => (
    <span className="relative shrink-0">
        <img src={avatarOf(p)} alt="" className={`${size} rounded-full object-cover border border-slate-200 bg-white`} />
        {online && <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-cloro-500 ring-2 ring-white" aria-hidden="true" />}
    </span>
);

/** Riga dell'elenco: nome, ultimo messaggio (o "sta scrivendo"), quando, non letti. */
const Row: React.FC<{ c: Conversation; me: string; onOpen: () => void }> = ({ c, me, onOpen }) => {
    const unread = c.unreadCount > 0;
    const name = displayNameOf(c.participant);
    const preview = c.isParticipantTyping ? 'Sta scrivendo…' : c.lastMessage.sentAt ? `${c.lastMessage.senderId === me ? 'Tu: ' : ''}${c.lastMessage.content || 'Allegato'}` : headlineOf(c.participant) || 'Inizia la conversazione';
    return (
        <li>
            <button type="button" onClick={onOpen} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-piastrella outline-hidden focus-visible:bg-piastrella">
                <Avatar p={c.participant} online={!!c.participant.isOnline} />
                <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                        <span className={`flex-1 truncate ${unread ? 'font-bold text-abisso' : 'font-semibold text-abisso'}`}>{name}</span>
                        {c.lastMessage.sentAt && <span className={`text-xs shrink-0 ${unread ? 'text-corsia-700 font-semibold' : 'text-slate-500'}`}>{formatRelativeTime(c.lastMessage.sentAt)}</span>}
                    </span>
                    <span className="flex items-center gap-2 mt-0.5">
                        <span className={`flex-1 truncate text-sm ${c.isParticipantTyping ? 'text-corsia-700 font-semibold' : unread ? 'text-abisso font-semibold' : 'text-slate-500'}`}>{preview}</span>
                        {unread && <span className="shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-corsia-600 text-white text-xs font-bold grid place-items-center">{c.unreadCount > 99 ? '99+' : c.unreadCount}</span>}
                    </span>
                </span>
                {unread && <span className="sr-only">, {c.unreadCount} da leggere</span>}
            </button>
        </li>
    );
};

/**
 * Messaggi come su LinkedIn (da 1280 px): l'elenco delle conversazioni in basso a destra e, accanto,
 * fino a 2-3 finestre di chat che si riducono a una barra. Si apre anche con `openChat()` da
 * "Scrivi"/"Messaggio" in tutta l'app, senza lasciare la pagina.
 */
export const MessagingDock: React.FC = () => {
    const { user, authenticated } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const hidden = !authenticated || location.pathname.startsWith('/messages');
    const [dock, setDock] = useState<DockState>(readDock);
    const [max, setMax] = useState(() => (typeof window === 'undefined' ? 2 : Math.max(1, maxWindowsFor(window.innerWidth))));
    const [query, setQuery] = useState('');
    const [tab, setTab] = useState<'tutti' | 'da-leggere'>('tutti');
    const [composing, setComposing] = useState(false);
    const [extra, setExtra] = useState<Record<string, Profile>>({});
    const searchRef = useRef<HTMLInputElement>(null);

    const openIds = useMemo(
        () => (user ? dock.windows.filter((w) => !w.minimized).map((w) => conversationIdOf(user.$id, w.userId)) : []),
        [dock.windows, user],
    );
    const { conversations, loading, error, reload, markRead, unread } = useConversations(user?.$id, user?.connections || [], !hidden, openIds);

    useEffect(() => saveDock(dock), [dock]);
    useEffect(() => {
        const onResize = () => setMax(Math.max(1, maxWindowsFor(window.innerWidth)));
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);
    useEffect(() => setDock((d) => (d.windows.length > max ? { ...d, windows: d.windows.slice(0, max) } : d)), [max]);

    // Presenza: online mentre l'app è aperta.
    useEffect(() => {
        if (!user?.$id) return;
        void databaseService.updatePresence(user.$id, true);
        const off = () => void databaseService.updatePresence(user.$id, false);
        window.addEventListener('beforeunload', off);
        return () => { window.removeEventListener('beforeunload', off); off(); };
    }, [user?.$id]);

    const profileOf = useCallback((id: string) => conversations.find((c) => (c.participant.userId || c.participant.$id) === id)?.participant || extra[id], [conversations, extra]);

    const open = useCallback(async (userId: string) => {
        if (!user || userId === user.$id) return;
        setComposing(false);
        setDock((d) => openWindow(d, userId, max));
        markRead(conversationIdOf(user.$id, userId));
        if (!profileOf(userId)) {
            try {
                const p = await databaseService.getProfile(userId);
                setExtra((e) => ({ ...e, [userId]: p }));
            } catch (err) {
                console.error('Profilo della conversazione:', err);
                setDock((d) => closeWindow(d, userId));
            }
        }
    }, [user, max, markRead, profileOf]);

    // "Scrivi" / "Messaggio" da qualsiasi pagina.
    const openRef = useRef(open);
    openRef.current = open;
    useEffect(() => {
        const onOpen = (e: Event) => { const id = (e as CustomEvent<string>).detail; if (id) void openRef.current(id); };
        window.addEventListener(OPEN_CHAT_EVENT, onOpen);
        return () => window.removeEventListener(OPEN_CHAT_EVENT, onOpen);
    }, []);

    useEffect(() => { if (composing) searchRef.current?.focus(); }, [composing]);

    if (hidden || !user) return null;

    const shown = filterConversations(conversations, query, tab === 'da-leggere');
    const talking = shown.filter((c) => c.lastMessage.sentAt);
    const starters = shown.filter((c) => !c.lastMessage.sentAt);
    // Nuovo messaggio: i collegamenti e chi ti ha già scritto, per nome.
    const people = composing ? filterConversations(conversations, query).slice(0, 30) : [];

    return (
        <div data-chat-dock className="hidden xl:flex fixed bottom-0 right-4 z-50 items-end gap-3 pointer-events-none">
            {/* Finestre di chat: la più recente accanto all'elenco */}
            <div className="flex flex-row-reverse items-end gap-3">
                {dock.windows.map((w) => {
                    const p = profileOf(w.userId);
                    const convId = conversationIdOf(user.$id, w.userId);
                    const conv = conversations.find((c) => c.conversationId === convId);
                    const name = p ? displayNameOf(p) : 'Conversazione';
                    const actions = (
                        <>
                            <button type="button" className={iconBtn} onClick={() => setDock((d) => toggleWindow(d, w.userId))} aria-label={w.minimized ? `Apri la chat con ${name}` : `Riduci la chat con ${name}`} title={w.minimized ? 'Apri' : 'Riduci'}>
                                <Icon type={w.minimized ? 'chevron-right' : 'minus'} className={`w-4 h-4 ${w.minimized ? '-rotate-90' : ''}`} />
                            </button>
                            <button type="button" className={iconBtn} onClick={() => { setDock((d) => closeWindow(d, w.userId)); navigate(`/messages?u=${encodeURIComponent(w.userId)}`); }} aria-label={`Apri la chat con ${name} a tutta pagina`} title="Apri a tutta pagina">
                                <Icon type="arrows-expand" className="w-4 h-4" />
                            </button>
                            <button type="button" className={iconBtn} onClick={() => setDock((d) => closeWindow(d, w.userId))} aria-label={`Chiudi la chat con ${name}`} title="Chiudi">
                                <Icon type="x" className="w-4 h-4" />
                            </button>
                        </>
                    );
                    return (
                        <section
                            key={w.userId}
                            aria-label={`Chat con ${name}`}
                            className={`pointer-events-auto w-[21rem] bg-white border border-slate-200 border-b-0 rounded-t-2xl shadow-lift flex flex-col overflow-hidden ${w.minimized ? 'h-14' : 'h-[min(32rem,calc(100dvh-6rem))]'}`}
                        >
                            {w.minimized || !p ? (
                                <div className="h-14 flex items-center gap-2 pl-3 pr-2">
                                    <button type="button" onClick={() => setDock((d) => toggleWindow(d, w.userId))} className="flex-1 min-w-0 flex items-center gap-2 text-left outline-hidden rounded-lg focus-visible:ring-2 focus-visible:ring-corsia-500">
                                        {p && <Avatar p={p} size="w-8 h-8" online={!!p.isOnline} />}
                                        <span className="truncate font-semibold text-abisso">{name}</span>
                                        {!!conv?.unreadCount && <span className="shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-corsia-600 text-white text-xs font-bold grid place-items-center">{conv.unreadCount}</span>}
                                    </button>
                                    {actions}
                                </div>
                            ) : null}
                            {p && (
                                <div className={w.minimized ? 'hidden' : 'flex-1 min-h-0 flex flex-col'}>
                                    <ChatWindow
                                        currentUserId={user.$id}
                                        participant={p}
                                        conversationId={convId}
                                        onProfileClick={(id) => navigate(`/profile/${id}`)}
                                        isWidget
                                        headerActions={actions}
                                    />
                                </div>
                            )}
                        </section>
                    );
                })}
            </div>

            {/* Elenco delle conversazioni */}
            <section
                aria-labelledby="dock-title"
                className={`pointer-events-auto w-[19rem] bg-white border border-slate-200 border-b-0 rounded-t-2xl shadow-lift flex flex-col overflow-hidden ${dock.open ? 'h-[min(36rem,calc(100dvh-6rem))]' : 'h-14'}`}
            >
                <div className="h-14 shrink-0 flex items-center gap-2 pl-3 pr-2 border-b border-slate-100">
                    <button
                        type="button"
                        onClick={() => setDock((d) => ({ ...d, open: !d.open }))}
                        aria-expanded={dock.open}
                        className="flex-1 min-w-0 flex items-center gap-2.5 text-left outline-hidden rounded-lg focus-visible:ring-2 focus-visible:ring-corsia-500"
                    >
                        <Avatar p={user} size="w-8 h-8" online />
                        <span id="dock-title" className="font-semibold text-abisso">Messaggi</span>
                        {unread > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-galleggiante-700 text-white text-xs font-bold grid place-items-center" aria-label={`${unread} da leggere`}>{unread > 99 ? '99+' : unread}</span>}
                    </button>
                    <button type="button" className={iconBtn} onClick={() => { setDock((d) => ({ ...d, open: true })); setComposing((v) => !v); setQuery(''); }} aria-label="Nuovo messaggio" title="Nuovo messaggio" aria-pressed={composing}>
                        <Icon type="pencil-square" className="w-[18px] h-[18px]" />
                    </button>
                    <button type="button" className={iconBtn} onClick={() => navigate('/messages')} aria-label="Apri la pagina Messaggi" title="Apri a tutta pagina">
                        <Icon type="arrows-expand" className="w-4 h-4" />
                    </button>
                    <button type="button" className={iconBtn} onClick={() => setDock((d) => ({ ...d, open: !d.open }))} aria-label={dock.open ? 'Riduci i messaggi' : 'Apri i messaggi'}>
                        <Icon type="chevron-right" className={`w-4 h-4 transition-transform ${dock.open ? 'rotate-90' : '-rotate-90'}`} />
                    </button>
                </div>

                {dock.open && (
                    <>
                        <div className="px-3 pt-3 pb-2 shrink-0 space-y-2">
                            <label className="relative block">
                                <span className="sr-only">{composing ? 'A chi vuoi scrivere?' : 'Cerca nei messaggi'}</span>
                                <Icon type="search" className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                <input
                                    ref={searchRef}
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder={composing ? 'Scrivi un nome…' : 'Cerca nei messaggi'}
                                    className="w-full pl-9 pr-3 py-2 rounded-full bg-piastrella border border-transparent focus:border-corsia-300 text-sm outline-hidden"
                                />
                            </label>
                            {!composing && (
                                <div className="flex gap-1" role="group" aria-label="Quali conversazioni">
                                    {(['tutti', 'da-leggere'] as const).map((t) => (
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() => setTab(t)}
                                            aria-pressed={tab === t}
                                            className={`px-3 py-1 rounded-full text-sm font-semibold ${tab === t ? 'bg-abisso text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                                        >
                                            {t === 'tutti' ? 'Tutti' : unread ? `Da leggere · ${unread}` : 'Da leggere'}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto">
                            {loading ? (
                                <ul aria-busy="true" aria-label="Caricamento delle conversazioni">
                                    {[0, 1, 2, 3].map((i) => (
                                        <li key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                                            <span className="w-12 h-12 rounded-full bg-slate-100" />
                                            <span className="flex-1 space-y-2"><span className="block h-3 w-2/3 rounded-sm bg-slate-100" /><span className="block h-3 w-1/2 rounded-sm bg-slate-100" /></span>
                                        </li>
                                    ))}
                                </ul>
                            ) : error ? (
                                <div className="p-6 text-center text-sm text-slate-600">
                                    Conversazioni non caricate.
                                    <button type="button" onClick={() => void reload()} className="block mx-auto mt-2 py-1 font-semibold text-corsia-700 hover:underline">Riprova</button>
                                </div>
                            ) : composing ? (
                                people.length ? (
                                    <ul>{people.map((c) => <Row key={c.conversationId} c={{ ...c, lastMessage: { content: '', sentAt: '', senderId: '' }, unreadCount: 0, isParticipantTyping: false }} me={user.$id} onOpen={() => void open(c.participant.userId || c.participant.$id)} />)}</ul>
                                ) : (
                                    <p className="p-6 text-center text-sm text-slate-500">Nessun collegamento con questo nome.</p>
                                )
                            ) : shown.length === 0 ? (
                                <div className="p-6 text-center text-sm text-slate-500">
                                    {query ? 'Nessuna conversazione trovata.' : tab === 'da-leggere' ? 'Sei in pari: nessun messaggio da leggere.' : 'Ancora nessun messaggio.'}
                                    {!query && tab === 'tutti' && <button type="button" onClick={() => setComposing(true)} className="block mx-auto mt-2 py-1 font-semibold text-corsia-700 hover:underline">Scrivi un messaggio</button>}
                                </div>
                            ) : (
                                <>
                                    <ul className="divide-y divide-slate-100">{talking.map((c) => <Row key={c.conversationId} c={c} me={user.$id} onOpen={() => void open(c.participant.userId || c.participant.$id)} />)}</ul>
                                    {starters.length > 0 && tab === 'tutti' && (
                                        <>
                                            <h3 className="px-4 pt-4 pb-1 text-xs font-semibold text-slate-500">Inizia una conversazione</h3>
                                            <ul>{starters.slice(0, query ? 30 : 8).map((c) => <Row key={c.conversationId} c={c} me={user.$id} onOpen={() => void open(c.participant.userId || c.participant.$id)} />)}</ul>
                                        </>
                                    )}
                                </>
                            )}
                        </div>
                    </>
                )}
            </section>
        </div>
    );
};
