import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/context/ToastContext';
import { useBlocks } from '@/context/BlocksContext';
import { databaseService } from '@/services/database';
import { avatarOf } from '@/utils/profile';
import { Comment, type EnrichedComment } from './Comment';
import { MentionTextarea, fromEditable, type MentionMap } from '@/components/form/MentionTextarea';

const PAGE = 3;

/**
 * Commenti sotto al post, senza cambiare pagina: si scrive subito, si leggono
 * tutti gli altri, si risponde e si mette mi piace.
 */
export const CommentsThread: React.FC<{
    postId: string;
    postAuthorId: string;
    autoFocus?: boolean;
    onCountChange?: (delta: number) => void;
}> = ({ postId, postAuthorId, autoFocus, onCountChange }) => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const blocks = useBlocks();
    const navigate = useNavigate();
    const [comments, setComments] = useState<EnrichedComment[] | null>(null);
    const [visible, setVisible] = useState(PAGE);
    const [text, setText] = useState('');
    const [mentions, setMentions] = useState<MentionMap>({});
    const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
    const [sending, setSending] = useState(false);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const load = useCallback(async () => {
        try {
            const list = await databaseService.getPostComments(postId, user?.$id);
            // Prima i più recenti, come su LinkedIn; le risposte restano in ordine di arrivo.
            setComments((list as unknown as EnrichedComment[]).slice().reverse());
        } catch (err) {
            console.error('Commenti:', err);
            showToast('Impossibile caricare i commenti.', 'error');
            setComments([]);
        }
    }, [postId, user?.$id, showToast]);

    useEffect(() => { void load(); }, [load]);
    useEffect(() => { if (autoFocus) inputRef.current?.focus(); }, [autoFocus]);

    const submit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        const content = fromEditable(text.trim(), mentions);
        if (!user || !content || sending) return;
        setSending(true);
        try {
            await databaseService.createComment(postId, user.$id, content, replyTo?.id || null);
            setText('');
            setMentions({});
            setReplyTo(null);
            onCountChange?.(1);
            await load();
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Commento non pubblicato.', 'error');
        } finally {
            setSending(false);
        }
    };

    const canDelete = (c: EnrichedComment) =>
        user && (c.authorId === user.$id || postAuthorId === user.$id)
            ? async () => {
                  if (!window.confirm('Eliminare il commento?')) return;
                  try {
                      await databaseService.deleteComment(c.$id);
                      onCountChange?.(-1 - (c.replies?.length || 0));
                      await load();
                  } catch (err) {
                      showToast(err instanceof Error ? err.message : 'Eliminazione non riuscita.', 'error');
                  }
              }
            : undefined;

    const shown = (comments || []).filter((c) => !blocks.isHidden(c.authorId));
    // Le risposte stanno su un solo livello: rispondere a una risposta vuol dire rispondere al commento principale.
    const topOf = (id: string) => shown.find((c) => c.$id === id || (c.replies || []).some((r) => r.$id === id))?.$id || id;

    return (
        <div className="px-4 sm:px-5 pb-4 pt-3 border-t border-slate-100 animate-in fade-in slide-in-from-top-1 duration-200 motion-reduce:animate-none">
            {user && (
                <form onSubmit={submit} className="flex items-start gap-2 mb-4">
                    <img src={avatarOf(user)} alt="" className="w-9 h-9 rounded-full object-cover border border-slate-100 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                        {replyTo && (
                            <p className="text-xs text-slate-500 mb-1">
                                Rispondi a <strong className="text-abisso">{replyTo.name}</strong>{' '}
                                <button type="button" onClick={() => setReplyTo(null)} className="font-semibold text-corsia-700 hover:underline">annulla</button>
                            </p>
                        )}
                        <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white focus-within:border-corsia-400 focus-within:ring-4 focus-within:ring-corsia-100 px-3 py-1.5">
                            <label htmlFor={`comment-${postId}`} className="sr-only">Scrivi un commento</label>
                            <div className="flex-1 min-w-0">
                            <MentionTextarea
                                id={`comment-${postId}`}
                                textareaRef={inputRef}
                                value={text}
                                onChange={(v) => setText(v.slice(0, 2000))}
                                mentions={mentions}
                                onMentionsChange={setMentions}
                                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(); } }}
                                rows={Math.min(5, Math.max(1, text.split('\n').length))}
                                placeholder={replyTo ? 'Scrivi una risposta…' : 'Aggiungi un commento…'}
                                className="w-full resize-none bg-transparent py-1 text-sm outline-none"
                            />
                            </div>
                            {text.trim() && (
                                <button type="submit" disabled={sending} className="mb-0.5 px-3 py-1 rounded-full text-sm font-semibold bg-corsia-600 text-white hover:bg-corsia-700 disabled:opacity-60">
                                    {sending ? 'Invio…' : 'Pubblica'}
                                </button>
                            )}
                        </div>
                    </div>
                </form>
            )}

            {comments === null ? (
                <div className="space-y-3" aria-hidden="true">
                    {[0, 1].map((i) => <div key={i} className="h-14 rounded-2xl bg-slate-100 animate-pulse" />)}
                </div>
            ) : shown.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-2">Nessun commento: scrivi il primo.</p>
            ) : (
                <div className="space-y-4">
                    {shown.slice(0, visible).map((c) => (
                        <Comment
                            key={c.$id}
                            comment={c}
                            onSelectProfile={(id) => navigate(`/profile/${id}`)}
                            onReply={(id, name) => { setReplyTo({ id: topOf(id), name }); inputRef.current?.focus(); }}
                            onDelete={canDelete}
                        />
                    ))}
                    {shown.length > visible && (
                        <button type="button" onClick={() => setVisible((v) => v + 10)} className="text-sm font-semibold text-slate-600 hover:text-corsia-700">
                            Mostra altri commenti ({shown.length - visible})
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};
