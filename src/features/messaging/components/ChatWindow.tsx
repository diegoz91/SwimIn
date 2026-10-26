import React, { useState, useEffect, useRef, useMemo } from 'react';
import { databaseService } from '@/services/database';
import { databases, client } from '@/services/appwrite';
import { APPWRITE_CONFIG } from '@/config/constants';
import { Query } from 'appwrite';
import type { UserProfile, StructureProfile, Message, ChatAttachment } from '@/types/types';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/context/ToastContext';
import { initialsAvatar } from '@/utils/avatar';
import { RichText } from '@/utils/richText';
import { useTypingUsers } from '@/hooks/useTypingUsers';
import { REACTIONS, reactionOf } from '@/data/reactions';
import {
import { useKeepInside } from '@/hooks/useKeepInside';
  CHAT_ACCEPT, chatFileUrl, discardChatFile, downloadChatFile, formatFileSize, isImageAttachment, parseAttachments, uploadChatFile,
} from '@/services/chatFiles';

interface ChatWindowProps {
  currentUserId: string;
  participant: UserProfile | StructureProfile;
  conversationId: string;
  onBack: () => void;
  onProfileClick?: (userId: string) => void;
  isWidget?: boolean;
}

/** Reazioni ammesse sui messaggi (allineate a MESSAGE_REACTIONS nella Function). */
const MESSAGE_REACTIONS = REACTIONS.filter((r) => ['consiglio', 'adoro', 'felice', 'applauso', 'interessante', 'sostegno'].includes(r.key));
const MAX_ATTACHMENTS = 4;

type Pending = { id: string; file: File; fileId?: string; error?: string; preview?: string };
type ReplyPreview = { id: string; senderId: string; text: string };

const parseJson = <T,>(raw: string | null | undefined, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn('Dato del messaggio non leggibile:', err);
    return fallback;
  }
};

const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Oggi';
  if (d.toDateString() === yesterday.toDateString()) return 'Ieri';
  return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) });
};

/** Foto allegata: scaricata con la sessione (il file è privato). */
const ChatImage: React.FC<{ a: ChatAttachment; onOpen: (url: string) => void }> = ({ a, onOpen }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    chatFileUrl(a.fileId, 'preview').then((u) => alive && setUrl(u)).catch((err) => { console.warn('Anteprima allegato:', err); if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [a.fileId]);
  if (failed) return <div className="w-40 h-28 rounded-xl bg-slate-100 text-slate-500 text-xs grid place-items-center px-3 text-center">Foto non disponibile</div>;
  return (
    <button
      type="button"
      onClick={() => chatFileUrl(a.fileId, 'view').then(onOpen).catch((err) => console.warn('Apertura allegato:', err))}
      className="block rounded-xl overflow-hidden bg-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-corsia-400"
      aria-label={`Apri la foto ${a.name}`}
    >
      {url ? <img src={url} alt={a.name} className="max-h-64 w-auto max-w-full object-cover" /> : <div className="w-48 h-32 animate-pulse" />}
    </button>
  );
};

const FileChip: React.FC<{ a: ChatAttachment; mine: boolean }> = ({ a, mine }) => {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const ext = (a.name.split('.').pop() || '').toUpperCase().slice(0, 4);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try { await downloadChatFile(a); } catch (err) { showToast(err instanceof Error ? err.message : 'Download non riuscito.', 'error'); } finally { setBusy(false); }
      }}
      className={`flex items-center gap-3 w-full max-w-xs text-left rounded-xl px-3 py-2.5 ${mine ? 'bg-black/15 hover:bg-black/25' : 'bg-slate-50 hover:bg-slate-100 border border-slate-200'}`}
    >
      <span className={`w-10 h-10 rounded-lg grid place-items-center text-[11px] font-bold flex-shrink-0 ${mine ? 'bg-white text-corsia-700' : 'bg-corsia-50 text-corsia-700'}`}>{ext || 'FILE'}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold truncate">{a.name}</span>
        <span className={`block text-xs ${mine ? 'text-white' : 'text-slate-500'}`}>{busy ? 'Download…' : formatFileSize(a.size)}</span>
      </span>
      <Icon type="download" className="w-5 h-5 flex-shrink-0 opacity-80" />
    </button>
  );
};

/** Contenitore di un menu che resta dentro il riquadro della chat (anche nel widget stretto). */
const KeepInside: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, ...rest }) => {
  const ref = React.useRef<HTMLDivElement>(null);
  useKeepInside(ref, true);
  return <div ref={ref} {...rest}>{children}</div>;
};

export const ChatWindow: React.FC<ChatWindowProps> = ({
  currentUserId,
  participant,
  conversationId,
  onBack,
  onProfileClick,
  isWidget = false
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const typingUsers = useTypingUsers(currentUserId);
  const [pending, setPending] = useState<Pending[]>([]);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingRef = useRef(0);
  const pendingRef = useRef<Pending[]>([]);
  const { showToast } = useToast();

  const participantId = participant.userId || participant.$id;
  const isParticipantTyping = typingUsers.has(participantId);
  pendingRef.current = pending;

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, isParticipantTyping]);

  useEffect(() => {
    let isMounted = true;

    const loadMessages = async () => {
      try {
        const msgs = await databases.listDocuments<Message>(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.collections.messages,
            [Query.equal('conversationId', conversationId), Query.orderDesc('$createdAt'), Query.limit(200)]
        );
        if (isMounted) setMessages([...msgs.documents].sort((a, b) => a.$createdAt.localeCompare(b.$createdAt)));

        await databaseService.markMessagesAsRead(conversationId, currentUserId);
      } catch (error) {
        console.error('Error loading messages:', error);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadMessages();

    const channelMessages = `databases.${APPWRITE_CONFIG.databaseId}.collections.${APPWRITE_CONFIG.collections.messages}.documents`;
    const unsubscribeMessages = client.subscribe(channelMessages, (response: { events: string[]; payload: unknown }) => {
        const payload = response.payload as Message;

        if (payload.conversationId === conversationId) {
            const isCreate = response.events.some((e: string) => e.includes('.create'));
            const isUpdate = response.events.some((e: string) => e.includes('.update'));

            if (isCreate) {
                setMessages(prev => {
                    if (prev.some(m => m.$id === payload.$id)) return prev;
                    // Sostituisce il messaggio ottimistico corrispondente, se c'è.
                    const tempIndex = prev.findIndex(m => m.$id.startsWith('temp_') && m.senderId === payload.senderId && m.content === payload.content && (m.attachments || []).length === (payload.attachments || []).length);
                    if (tempIndex >= 0) return prev.map((m, i) => (i === tempIndex ? payload : m));
                    return [...prev, payload];
                });

                if (payload.receiverId === currentUserId) {
                    databaseService.markMessagesAsRead(conversationId, currentUserId);
                }
            } else if (isUpdate) {
                setMessages(prev => prev.map(msg => msg.$id === payload.$id ? payload : msg));
            }
        }
    });

    return () => {
      isMounted = false;
      unsubscribeMessages();
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (lastTypingRef.current) databaseService.setTypingStatus(currentUserId, null);
      lastTypingRef.current = 0;
      // Allegati caricati ma non inviati: si eliminano.
      for (const p of pendingRef.current) {
        if (p.fileId) discardChatFile(p.fileId);
        if (p.preview) URL.revokeObjectURL(p.preview);
      }
    };
  }, [conversationId, currentUserId, participantId]);

  // Chiude il menu delle azioni toccando altrove.
  useEffect(() => {
    if (!activeId && !pickerFor) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-msg-actions]')) { setActiveId(null); setPickerFor(null); }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [activeId, pickerFor]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setLightbox(null);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [lightbox]);

  // "Sta scrivendo": al massimo un aggiornamento ogni 3 secondi (la riga scade da sola dopo 6).
  const handleTyping = (text: string) => {
      setNewMessage(text);
      const now = Date.now();
      if (text.trim() && now - lastTypingRef.current > 3000) {
          lastTypingRef.current = now;
          databaseService.setTypingStatus(currentUserId, participantId);
      }
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
          if (!lastTypingRef.current) return;
          lastTypingRef.current = 0;
          databaseService.setTypingStatus(currentUserId, null);
      }, 4000);
  };

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const room = MAX_ATTACHMENTS - pending.length;
    const files = Array.from(list).slice(0, Math.max(0, room));
    if (list.length > room) showToast(`Puoi allegare al massimo ${MAX_ATTACHMENTS} file per messaggio.`, 'info');
    for (const file of files) {
      const id = `p_${Math.random().toString(36).slice(2, 9)}`;
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
      setPending((prev) => [...prev, { id, file, preview }]);
      uploadChatFile(file, currentUserId)
        .then((fileId) => setPending((prev) => {
          if (!prev.some((p) => p.id === id)) { discardChatFile(fileId); return prev; } // rimosso nel frattempo
          return prev.map((p) => (p.id === id ? { ...p, fileId } : p));
        }))
        .catch((err) => setPending((prev) => prev.map((p) => (p.id === id ? { ...p, error: err instanceof Error ? err.message : 'Caricamento non riuscito.' } : p))));
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const removePending = (p: Pending) => {
    setPending((prev) => prev.filter((x) => x.id !== p.id));
    if (p.fileId) discardChatFile(p.fileId);
    if (p.preview) URL.revokeObjectURL(p.preview);
  };

  const uploading = pending.some((p) => !p.fileId && !p.error);
  const ready = pending.filter((p) => p.fileId);
  const canSend = (!!newMessage.trim() || ready.length > 0) && !uploading && !isSending;

  const handleSendMessage = async () => {
    const trimmedText = newMessage.trim();
    if (!canSend) return;
    const sent = ready;
    const attachments = sent.map((p) => p.fileId as string);
    const reply = replyTo;

    const tempId = `temp_${Date.now()}`;
    const optimisticMessage = {
        $id: tempId,
        conversationId,
        senderId: currentUserId,
        receiverId: participantId,
        content: trimmedText,
        isRead: false,
        attachments: sent.map((p) => JSON.stringify({ fileId: p.fileId, name: p.file.name, mime: p.file.type, size: p.file.size })),
        ...(reply ? { replyToId: reply.$id, replyPreview: JSON.stringify({ id: reply.$id, senderId: reply.senderId, text: (reply.content || '').slice(0, 140) || (parseAttachments(reply.attachments).length ? 'Allegato' : '') }) } : {}),
        $createdAt: new Date().toISOString(),
    } as Message;

    setMessages(prev => [...prev, optimisticMessage]);
    setNewMessage('');
    setPending((prev) => prev.filter((p) => !sent.includes(p)));
    setReplyTo(null);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (lastTypingRef.current) databaseService.setTypingStatus(currentUserId, null);
    lastTypingRef.current = 0;

    try {
      setIsSending(true);
      const saved = await databaseService.sendMessage(conversationId, currentUserId, participantId, trimmedText, { attachments, replyToId: reply?.$id });
      setMessages(prev => (prev.some(m => m.$id === saved.$id) ? prev.filter(m => m.$id !== tempId) : prev.map(m => (m.$id === tempId ? saved : m))));
      sent.forEach((p) => p.preview && URL.revokeObjectURL(p.preview));
    } catch (error) {
      console.error('Invio messaggio:', error);
      setMessages(prev => prev.filter(m => m.$id !== tempId));
      // Testo, allegati e risposta tornano nel campo, così non si perdono (es. dopo l'invito a Premium).
      setNewMessage(trimmedText);
      setPending((prev) => [...sent, ...prev]);
      setReplyTo(reply);
      showToast(error instanceof Error ? error.message : "Errore nell'invio. Riprova.", "error");
    } finally {
      setIsSending(false);
    }
  };

  const react = async (msg: Message, key: string) => {
    setPickerFor(null);
    setActiveId(null);
    const current = parseJson<Record<string, string>>(msg.reactions, {});
    const next = current[currentUserId] === key ? null : key;
    const optimistic = { ...current };
    if (next) optimistic[currentUserId] = next; else delete optimistic[currentUserId];
    setMessages((prev) => prev.map((m) => (m.$id === msg.$id ? { ...m, reactions: JSON.stringify(optimistic) } : m)));
    try {
      const { reactions } = await databaseService.reactMessage(msg.$id, next);
      setMessages((prev) => prev.map((m) => (m.$id === msg.$id ? { ...m, reactions: JSON.stringify(reactions) } : m)));
    } catch (err) {
      setMessages((prev) => prev.map((m) => (m.$id === msg.$id ? { ...m, reactions: msg.reactions } : m)));
      showToast(err instanceof Error ? err.message : 'Reazione non salvata.', 'error');
    }
  };

  const remove = async (msg: Message) => {
    setActiveId(null);
    if (!window.confirm('Eliminare il messaggio per tutti? Anche gli allegati verranno cancellati.')) return;
    try {
      await databaseService.deleteMessage(msg.$id);
      setMessages((prev) => prev.map((m) => (m.$id === msg.$id ? { ...m, deleted: true, content: '', attachments: [], reactions: null, replyPreview: null } : m)));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Eliminazione non riuscita.', 'error');
    }
  };

  const startReply = (msg: Message) => {
    setActiveId(null);
    setReplyTo(msg);
    inputRef.current?.focus();
  };

  const scrollToMessage = (id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ring-2', 'ring-corsia-300');
    window.setTimeout(() => el.classList.remove('ring-2', 'ring-corsia-300'), 1200);
  };

  const formatTimestamp = (isoString: string) => {
    if (!isoString) return '';
    return new Date(isoString).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  };

  const getParticipantName = (): string => {
    if (participant.userType === 'professional') {
      return `${(participant as UserProfile).firstName || ''} ${(participant as UserProfile).lastName || ''}`.trim() || 'Utente';
    }
    return (participant as StructureProfile).structureName || 'Struttura';
  };

  const getParticipantAvatar = (): string => {
    const name = getParticipantName();
    if (participant.userType === 'professional' && (participant as UserProfile).avatar) return (participant as UserProfile).avatar as string;
    if (participant.userType === 'structure' && (participant as StructureProfile).logo) return (participant as StructureProfile).logo as string;
    return initialsAvatar(name);
  };

  const allowReadReceipts = participant.readReceipts !== false;
  const nameOf = (senderId: string) => (senderId === currentUserId ? 'Tu' : getParticipantName());
  const replyText = (m: Message) => m.content || (parseAttachments(m.attachments).length ? 'Allegato' : '');

  const lastMineRead = useMemo(() => [...messages].reverse().find((m) => m.senderId === currentUserId && m.isRead)?.$id, [messages, currentUserId]);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 relative min-h-0 min-w-0 w-full">
      <div className="flex items-center p-3 sm:p-4 border-b border-slate-200 bg-white sticky top-0 z-10 shadow-sm">
        <button
            onClick={onBack}
            aria-label="Torna alle conversazioni"
            className={`${isWidget ? 'block' : 'md:hidden'} mr-3 p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
        >
          <Icon type="arrow-left" className="w-6 h-6" />
        </button>

        <div
          className="flex items-center cursor-pointer hover:bg-slate-50 rounded-xl p-2 -ml-2 transition-colors flex-1 min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          onClick={() => onProfileClick?.(participantId)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') onProfileClick?.(participantId); }}
        >
          <img src={getParticipantAvatar()} alt="" className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover mr-3 border border-slate-100 shadow-sm bg-white" />
          <div className="min-w-0">
            <p className="font-bold text-slate-800 leading-tight text-sm sm:text-base truncate">{getParticipantName()}</p>
            {isParticipantTyping ? (
                <p className="text-xs sm:text-sm text-corsia-600 font-semibold">Sta scrivendo…</p>
            ) : (
                <p className="text-xs sm:text-sm text-slate-500 truncate">
                {participant.userType === 'professional' ? (participant as UserProfile).title : (participant as StructureProfile).structureType}
                </p>
            )}
          </div>
        </div>
      </div>

      <div
        className="flex-1 p-4 overflow-y-auto overflow-x-hidden custom-scrollbar"
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
        onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } }}
      >
        {isLoading ? (
          <div className="flex justify-center items-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-80 text-center px-4">
            <Icon type="chat-bubble" className="w-12 h-12 sm:w-16 sm:h-16 mb-4 text-slate-300" />
            <p className="font-medium text-slate-600 text-sm sm:text-base">Nessun messaggio</p>
            <p className="text-sm text-slate-500 mt-1">Scrivi il primo messaggio o allega un documento.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg, index) => {
              const isMe = msg.senderId === currentUserId;
              const prev = messages[index - 1];
              const newDay = !prev || new Date(prev.$createdAt).toDateString() !== new Date(msg.$createdAt).toDateString();
              const showAvatar = !isMe && (index === messages.length - 1 || messages[index + 1].senderId === currentUserId);
              const files = parseAttachments(msg.attachments);
              const images = files.filter(isImageAttachment);
              const docs = files.filter((a) => !isImageAttachment(a));
              const reply = parseJson<ReplyPreview | null>(msg.replyPreview, null);
              const reactions = Object.entries(parseJson<Record<string, string>>(msg.reactions, {}));
              const isTemp = msg.$id.startsWith('temp_');
              const actionsOpen = activeId === msg.$id;

              return (
                <React.Fragment key={msg.$id}>
                  {newDay && (
                    <div className="flex justify-center py-2">
                      <span className="text-xs font-semibold text-slate-500 bg-white border border-slate-200 rounded-full px-3 py-1 inline-block first-letter:uppercase">{dayLabel(msg.$createdAt)}</span>
                    </div>
                  )}
                  <div className={`group flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                    {!isMe && (
                      <div className="w-6 sm:w-8 flex-shrink-0">
                        {showAvatar && (
                          <img src={getParticipantAvatar()} className="w-6 h-6 sm:w-8 sm:h-8 rounded-full object-cover shadow-sm bg-white" alt="" />
                        )}
                      </div>
                    )}

                    {/* Azioni: a sinistra dei miei messaggi, a destra di quelli ricevuti. */}
                    {!msg.deleted && !isTemp && (
                      <div data-msg-actions className={`relative self-center ${isMe ? 'order-first' : 'order-last'}`}>
                        <button
                          type="button"
                          onClick={() => setActiveId(actionsOpen ? null : msg.$id)}
                          aria-label="Azioni sul messaggio"
                          aria-expanded={actionsOpen}
                          className={`p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-white transition-opacity ${actionsOpen ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100'}`}
                        >
                          <Icon type="ellipsis" className="w-4 h-4" />
                        </button>
                        {actionsOpen && (
                          <KeepInside role="menu" className={`absolute bottom-full mb-1 z-20 w-48 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-xl py-1 ${isMe ? 'left-0' : 'right-0'}`}>
                            <button role="menuitem" onClick={() => startReply(msg)} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"><Icon type="reply" className="w-4 h-4 text-slate-400" /> Rispondi</button>
                            <button role="menuitem" onClick={() => { setActiveId(null); setPickerFor(msg.$id); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"><Icon type="face-smile" className="w-4 h-4 text-slate-400" /> Reagisci</button>
                            {msg.content && (
                              <button role="menuitem" onClick={() => { setActiveId(null); navigator.clipboard?.writeText(msg.content).then(() => showToast('Testo copiato.', 'info')).catch((err) => console.warn('Copia:', err)); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"><Icon type="document" className="w-4 h-4 text-slate-400" /> Copia testo</button>
                            )}
                            {isMe && (
                              <button role="menuitem" onClick={() => remove(msg)} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-galleggiante-700 hover:bg-red-50"><Icon type="trash" className="w-4 h-4" /> Elimina per tutti</button>
                            )}
                          </KeepInside>
                        )}
                        {pickerFor === msg.$id && (
                          <KeepInside role="group" aria-label="Scegli una reazione" className={`absolute bottom-full mb-1 z-20 flex gap-0.5 bg-white border border-slate-200 rounded-full shadow-xl px-1.5 py-1 ${isMe ? 'left-0' : 'right-0'}`}>
                            {MESSAGE_REACTIONS.map((r) => (
                              <button key={r.key} type="button" onClick={() => react(msg, r.key)} aria-label={r.label} title={r.label} className="w-9 h-9 grid place-items-center rounded-full text-xl hover:bg-slate-100 hover:scale-110 transition-transform">
                                <span aria-hidden="true">{r.emoji}</span>
                              </button>
                            ))}
                          </KeepInside>
                        )}
                      </div>
                    )}

                    <div className={`flex flex-col min-w-0 max-w-[85%] sm:max-w-md ${isMe ? 'items-end' : 'items-start'}`}>
                      <div
                        id={`msg-${msg.$id}`}
                        className={`relative max-w-full min-w-0 rounded-2xl shadow-sm transition-shadow ${msg.deleted ? 'px-3 py-2 bg-transparent border border-dashed border-slate-300 text-slate-500' : isMe ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white text-slate-800 border border-slate-100 rounded-bl-sm'} ${!msg.deleted ? (images.length && !msg.content && !docs.length && !reply ? 'p-1' : 'px-3 py-2 sm:px-4 sm:py-2.5') : ''} ${isTemp ? 'opacity-70' : ''}`}
                      >
                        {msg.deleted ? (
                          <p className="text-sm italic flex items-center gap-1.5"><Icon type="x" className="w-4 h-4" /> Messaggio eliminato</p>
                        ) : (
                          <>
                            {reply && (
                              <button
                                type="button"
                                onClick={() => scrollToMessage(reply.id)}
                                className={`block w-full min-w-0 max-w-[16rem] sm:max-w-sm text-left mb-2 rounded-lg px-2.5 py-1.5 border-l-4 text-xs ${isMe ? 'bg-white/15 border-white/70 text-blue-50' : 'bg-slate-50 border-corsia-400 text-slate-600'}`}
                              >
                                <span className="block font-semibold">{nameOf(reply.senderId)}</span>
                                <span className="block truncate">{reply.text || 'Messaggio'}</span>
                              </button>
                            )}
                            {images.length > 0 && (
                              <div className={`grid gap-1 ${images.length > 1 ? 'grid-cols-2' : ''} ${msg.content || docs.length ? 'mb-2' : ''}`}>
                                {images.map((a) => <ChatImage key={a.fileId} a={a} onOpen={setLightbox} />)}
                              </div>
                            )}
                            {docs.length > 0 && (
                              <div className={`space-y-1.5 ${msg.content ? 'mb-2' : ''}`}>
                                {docs.map((a) => <FileChip key={a.fileId} a={a} mine={isMe} />)}
                              </div>
                            )}
                            {msg.content && (
                              <p className="text-[14px] sm:text-[15px] break-words whitespace-pre-wrap leading-relaxed"><RichText text={msg.content} inverse={isMe} /></p>
                            )}
                          </>
                        )}
                        <div className={`flex justify-end items-center gap-1 mt-1 text-[10px] sm:text-[11px] ${msg.deleted ? 'text-slate-400' : isMe ? 'text-blue-100' : 'text-slate-400'} ${images.length && !msg.content && !docs.length && !reply && !msg.deleted ? 'px-2 pb-1' : ''}`}>
                          <span>{formatTimestamp(msg.$createdAt)}</span>
                          {isMe && !msg.deleted && (
                            <Icon
                              type={msg.isRead && allowReadReceipts ? "check-double" : "check"}
                              className={`w-3.5 h-3.5 ${msg.isRead && allowReadReceipts ? 'text-white' : 'text-blue-300'}`}
                              aria-label={msg.isRead && allowReadReceipts ? 'Letto' : isTemp ? 'Invio in corso' : 'Inviato'}
                            />
                          )}
                        </div>
                      </div>
                      {reactions.length > 0 && (
                        <div className="-mt-2 mx-2 flex gap-1 relative z-[1]">
                          {reactions.map(([uid, key]) => {
                            const r = reactionOf(key);
                            if (!r) return null;
                            return (
                              <button
                                key={uid}
                                type="button"
                                onClick={() => uid === currentUserId && react(msg, key)}
                                title={`${nameOf(uid)}: ${r.label}${uid === currentUserId ? ' (tocca per togliere)' : ''}`}
                                aria-label={`${nameOf(uid)} ha reagito con ${r.label}`}
                                className="bg-white border border-slate-200 rounded-full px-2 py-1 min-w-[1.75rem] text-sm shadow-sm leading-none"
                              >
                                <span aria-hidden="true">{r.emoji}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {isMe && msg.$id === lastMineRead && allowReadReceipts && index === messages.length - 1 && (
                        <span className="text-[11px] text-slate-400 mt-1 mr-1">Visualizzato</span>
                      )}
                    </div>
                  </div>
                </React.Fragment>
              );
            })}

            {isParticipantTyping && (
                 <div className="flex items-end gap-2 justify-start animate-in fade-in slide-in-from-bottom-2">
                    <div className="w-6 sm:w-8 flex-shrink-0">
                        <img src={getParticipantAvatar()} className="w-6 h-6 sm:w-8 sm:h-8 rounded-full object-cover shadow-sm bg-white" alt="" />
                    </div>
                    <div className="bg-white border border-slate-100 text-slate-500 rounded-2xl rounded-bl-sm px-3 py-2 sm:px-4 sm:py-3 shadow-sm flex items-center gap-1" aria-label="Sta scrivendo">
                        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                </div>
            )}
          </div>
        )}
        <div ref={messagesEndRef} className="h-4" />
      </div>

      <div className="p-2 sm:p-3 bg-white border-t border-slate-200">
        {replyTo && (
          <div className="flex items-start gap-2 mb-2 mx-1 rounded-xl bg-slate-50 border-l-4 border-corsia-400 px-3 py-2">
            <Icon type="reply" className="w-4 h-4 text-corsia-600 mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1 text-xs">
              <p className="font-semibold text-abisso">Rispondi a {replyTo.senderId === currentUserId ? 'te stesso' : getParticipantName()}</p>
              <p className="text-slate-500 truncate">{replyText(replyTo) || 'Messaggio'}</p>
            </div>
            <button type="button" onClick={() => setReplyTo(null)} aria-label="Annulla la risposta" className="p-1 rounded-full text-slate-400 hover:bg-slate-200"><Icon type="x" className="w-4 h-4" /></button>
          </div>
        )}
        {pending.length > 0 && (
          <ul className="flex gap-2 mb-2 mx-1 overflow-x-auto pb-1" aria-label="Allegati da inviare">
            {pending.map((p) => (
              <li key={p.id} className={`relative flex-shrink-0 rounded-xl border ${p.error ? 'border-galleggiante' : 'border-slate-200'} bg-slate-50 overflow-hidden`}>
                {p.preview ? (
                  <img src={p.preview} alt={p.file.name} className="w-16 h-16 object-cover" />
                ) : (
                  <div className="w-36 h-16 px-2.5 py-2 text-xs">
                    <p className="font-semibold text-abisso truncate">{p.file.name}</p>
                    <p className="text-slate-500">{formatFileSize(p.file.size)}</p>
                  </div>
                )}
                {!p.fileId && !p.error && <div className="absolute inset-0 bg-white/60 grid place-items-center"><div className="w-5 h-5 border-2 border-corsia-600 border-t-transparent rounded-full animate-spin" aria-label="Caricamento" /></div>}
                {p.error && <p className="absolute inset-x-0 bottom-0 bg-galleggiante text-white text-[10px] px-1 py-0.5 truncate" title={p.error}>{p.error}</p>}
                <button type="button" onClick={() => removePending(p)} aria-label={`Rimuovi ${p.file.name}`} className="absolute top-1 right-1 w-5 h-5 grid place-items-center rounded-full bg-abisso/70 text-white hover:bg-abisso">
                  <Icon type="x" className="w-3 h-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-end gap-1.5 bg-slate-50 p-1 sm:p-1.5 rounded-3xl border border-slate-200 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={pending.length >= MAX_ATTACHMENTS}
            aria-label="Allega foto o documento"
            title="Allega foto, PDF, Word o Excel (max 10 MB)"
            className="p-2 rounded-full text-slate-500 hover:text-corsia-700 hover:bg-white disabled:opacity-40"
          >
            <Icon type="paperclip" className="w-5 h-5" />
          </button>
          <input ref={fileRef} type="file" multiple accept={CHAT_ACCEPT} className="hidden" onChange={(e) => addFiles(e.target.files)} />
          <label htmlFor={`chat-input-${conversationId}`} className="sr-only">Scrivi un messaggio</label>
          <textarea
            id={`chat-input-${conversationId}`}
            ref={inputRef}
            rows={1}
            value={newMessage}
            onChange={(e) => handleTyping(e.target.value)}
            onPaste={(e) => { if (e.clipboardData.files.length) { e.preventDefault(); addFiles(e.clipboardData.files); } }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Scrivi un messaggio…"
            maxLength={4000}
            className="flex-1 bg-transparent py-2 px-1 focus:outline-none text-slate-800 placeholder-slate-400 text-sm sm:text-base resize-none max-h-32"
            style={{ height: 'auto', minHeight: '2.25rem' }}
            onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = `${Math.min(t.scrollHeight, 128)}px`; }}
          />

          <button
            onClick={handleSendMessage}
            disabled={!canSend}
            aria-label={uploading ? 'Caricamento degli allegati in corso' : 'Invia'}
            className="bg-blue-600 text-white rounded-full p-2 sm:p-2.5 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed shadow-md transition-all active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            {isSending || uploading ? (
               <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <Icon type="send" className="w-4 h-4 sm:w-5 sm:h-5 ml-0.5" />
            )}
          </button>
        </div>
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-[140] bg-abisso/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)} role="dialog" aria-modal="true" aria-label="Foto">
          <button type="button" onClick={() => setLightbox(null)} aria-label="Chiudi" className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"><Icon type="x" className="w-6 h-6" /></button>
          <img src={lightbox} alt="" className="max-w-full max-h-full object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
};
