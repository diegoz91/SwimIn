import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { databaseService } from '@/services/database';
import { useToast } from '@/context/ToastContext';
import type { EnrichedPost, UserProfile, StructureProfile } from '@/types/types';
import { Icon, type IconType } from '@/components/ui/Icon';
import { LikesModal } from './LikesModal';
import { ReportModal } from '@/components/common/ReportModal';
import { useSaved } from '@/context/SavedContext';
import { getPostContent } from '@/utils/postMedia';
import { formatRelativeTime } from '@/utils/format';
import { initialsAvatar } from '@/utils/avatar';
import { avatarOf, displayNameOf } from '@/utils/profile';
import { parseReactionCounts, topReactions, type ReactionKey } from '@/data/reactions';
import { ReactionButton } from './ReactionButton';
import { CommentsThread } from './CommentsThread';
import { FormModal } from '@/components/form/FormModal';
import { PremiumBadge } from '@/features/premium/PremiumBadge';
import { RichText, cutText, plainText } from '@/utils/richText';
import { PollView } from './PollView';
import { MentionTextarea, fromEditable, toEditable, type MentionMap } from '@/components/form/MentionTextarea';
import { isPremium } from '@/utils/premium';
import { useConfirm } from '@/context/ConfirmContext';

interface PostCardProps {
    post: EnrichedPost;
    onSelectPost?: (post: EnrichedPost) => void;
    /** Chiamato dopo l'eliminazione del post da parte dell'autore. */
    onDeleted?: (postId: string) => void;
    /** Chiamato dopo una modifica, con il post aggiornato. */
    onUpdated?: (post: EnrichedPost) => void;
    /** Ripubblicazione senza pensiero: chi l'ha ripubblicato (si mostra l'originale con questa intestazione). */
    repostedBy?: { id: string; name: string; repostId: string; mine: boolean };
    /** Chiamato quando l'utente ripubblica: la nuova ripubblicazione da mettere in cima al feed. */
    onReposted?: (post: EnrichedPost) => void;
    /** Al posto dei commenti sotto al post (es. nella pagina del post, che ha già i suoi). */
    onCommentClick?: () => void;
    /** Amministratore del gruppo in cui è pubblicato il post: può rimuoverlo. */
    canModerate?: boolean;
}

const CATEGORY_STYLES: Record<string, { icon: IconType; text: string; style: string }> = {
    allenamento: { icon: 'clock', text: 'Allenamento', style: 'bg-blue-50 text-blue-600 border-blue-200' },
    gara: { icon: 'star', text: 'Gara & Risultati', style: 'bg-amber-50 text-amber-600 border-amber-200' },
    tecnica: { icon: 'certificate', text: 'Tecnica & Formazione', style: 'bg-purple-50 text-purple-600 border-purple-200' },
    normative: { icon: 'info', text: 'Normative & Sicurezza', style: 'bg-red-50 text-red-700 border-red-200' },
};

const CONTENT_MAX_LENGTH = 4000;
const COLLAPSED_LENGTH = 400;

/** Smista: le ripubblicazioni senza pensiero mostrano il post originale. */
export const PostCard: React.FC<PostCardProps> = (props) => {
    if (props.post.repostOf && !props.post.content?.trim() && !props.repostedBy) return <PureRepost {...props} />;
    return <PostCardBody {...props} />;
};

const PostCardBody: React.FC<PostCardProps> = ({ post, onSelectPost, onDeleted, onUpdated, repostedBy, onReposted, onCommentClick, canModerate = false }) => {
    const confirm = useConfirm();
    const { user } = useAuth();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { isSaved, toggle: toggleSaved } = useSaved();

    const [likes, setLikes] = useState(post.likesCount || 0);
    const [reaction, setReaction] = useState<string | null>(post.myReaction ?? (post.likedByMe ? 'consiglio' : null));
    const [counts, setCounts] = useState(() => parseReactionCounts(post.reactionCounts, post.likesCount || 0));
    const [isLiking, setIsLiking] = useState(false);
    const [commentsCount, setCommentsCount] = useState(post.commentsCount || 0);
    const [showComments, setShowComments] = useState(false);
    const [reposts, setReposts] = useState(post.repostsCount || 0);
    const [repostOpen, setRepostOpen] = useState(false);
    const [thoughtOpen, setThoughtOpen] = useState(false);
    const [thought, setThought] = useState('');
    const [reposting, setReposting] = useState(false);
    const [alreadyReposted, setAlreadyReposted] = useState<boolean | null>(null);
    const repostRef = useRef<HTMLDivElement>(null);
    const [isLikesModalOpen, setIsLikesModalOpen] = useState(false);
    const [author, setAuthor] = useState<UserProfile | StructureProfile | null>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isBusy, setIsBusy] = useState(false);
    const [isReportOpen, setIsReportOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const { text: displayContent, media } = getPostContent(post);
    const [draft, setDraft] = useState(displayContent);
    const [editMentions, setEditMentions] = useState<MentionMap>({});
    const isMine = !!user && post.authorId === user.$id;

    useEffect(() => {
        setLikes(post.likesCount || 0);
        setReaction(post.myReaction ?? (post.likedByMe ? 'consiglio' : null));
        setCounts(parseReactionCounts(post.reactionCounts, post.likesCount || 0));
    }, [post.likesCount, post.likedByMe, post.myReaction, post.reactionCounts]);
    useEffect(() => setCommentsCount(post.commentsCount || 0), [post.commentsCount]);
    useEffect(() => setReposts(post.repostsCount || 0), [post.repostsCount]);

    useEffect(() => {
        if (!repostOpen) return;
        if (alreadyReposted === null && user) {
            databaseService.hasReposted(post.$id, user.$id).then(setAlreadyReposted).catch((err) => { console.warn('Ripubblicazioni:', err); setAlreadyReposted(false); });
        }
        const close = (e: MouseEvent) => repostRef.current && !repostRef.current.contains(e.target as Node) && setRepostOpen(false);
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setRepostOpen(false);
        document.addEventListener('mousedown', close);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', close);
            document.removeEventListener('keydown', onKey);
        };
    }, [repostOpen, alreadyReposted, user, post.$id]);

    useEffect(() => {
        let isMounted = true;
        databaseService
            .getProfile(post.authorId)
            .then((profile) => isMounted && setAuthor(profile))
            .catch(() => undefined); // autore eliminato: mostriamo un nome generico
        return () => {
            isMounted = false;
        };
    }, [post.authorId]);

    useEffect(() => {
        if (!isMenuOpen) return;
        const close = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setIsMenuOpen(false);
        };
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setIsMenuOpen(false);
        document.addEventListener('mousedown', close);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', close);
            document.removeEventListener('keydown', onKey);
        };
    }, [isMenuOpen]);

    const handleReact = async (next: ReactionKey | null) => {
        if (!user || isLiking) return;
        setIsLiking(true);
        // Aggiornamento ottimistico, poi allineamento con i valori del server.
        const prev = { reaction, likes, counts };
        const optimistic = { ...counts };
        if (reaction) optimistic[reaction as ReactionKey] = Math.max(0, (optimistic[reaction as ReactionKey] || 1) - 1);
        if (next) optimistic[next] = (optimistic[next] || 0) + 1;
        setReaction(next);
        setCounts(optimistic);
        setLikes((n) => Math.max(0, n + (next ? 1 : 0) - (reaction ? 1 : 0)));
        try {
            const res = await databaseService.react(post.$id, next);
            setReaction(res.reaction);
            setLikes(res.likesCount);
            setCounts(res.reactionCounts);
        } catch (error) {
            console.error('Reazione:', error);
            setReaction(prev.reaction);
            setLikes(prev.likes);
            setCounts(prev.counts);
            showToast('Non è stato possibile registrare la reazione.', 'error');
        } finally {
            setIsLiking(false);
        }
    };

    const doRepost = async (content = '') => {
        if (!user || reposting) return;
        setReposting(true);
        try {
            const created = await databaseService.repost(post.$id, content);
            setReposts(created.originalRepostsCount);
            setAlreadyReposted(!content || alreadyReposted);
            setRepostOpen(false);
            setThoughtOpen(false);
            setThought('');
            showToast(content ? 'Hai ripubblicato il post con il tuo pensiero.' : 'Hai ripubblicato il post con i tuoi collegamenti.', 'success');
            onReposted?.({ ...created, likedByMe: false, myReaction: null });
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Ripubblicazione non riuscita.', 'error');
        } finally {
            setReposting(false);
        }
    };

    const undoRepost = async () => {
        setReposting(true);
        try {
            const res = await databaseService.undoRepost(post.$id);
            setReposts(res.repostsCount);
            setAlreadyReposted(false);
            setRepostOpen(false);
            showToast('Ripubblicazione annullata.', 'info');
            if (repostedBy?.mine) onDeleted?.(repostedBy.repostId);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Operazione non riuscita.', 'error');
        } finally {
            setReposting(false);
        }
    };

    const handleShare = async () => {
        setIsMenuOpen(false);
        const url = `${window.location.origin}/post/${post.$id}`;
        try {
            if (navigator.share) {
                await navigator.share({ title: 'Post su SwimIn', url });
            } else {
                await navigator.clipboard.writeText(url);
                showToast('Link del post copiato.', 'success');
            }
        } catch {
            // condivisione annullata dall'utente
        }
    };

    const handleSaveEdit = async () => {
        const content = fromEditable(draft.trim(), editMentions);
        if (!content && media.length === 0) return;
        setIsBusy(true);
        try {
            const updated = await databaseService.updatePost(post.$id, { content });
            setIsEditing(false);
            onUpdated?.({ ...post, ...updated, media: updated.media?.length ? updated.media : post.media });
            showToast('Post aggiornato.', 'success');
        } catch (error) {
            console.error('updatePost:', error);
            showToast('Modifica non riuscita.', 'error');
        } finally {
            setIsBusy(false);
        }
    };

    const handleDelete = async () => {
        setIsMenuOpen(false);
        if (!(await confirm({ title: 'Eliminare il post?', message: 'Verranno rimossi anche commenti e consigli. Non si può annullare.', confirmLabel: 'Elimina', tone: 'danger' }))) return;
        setIsBusy(true);
        try {
            await databaseService.deletePost(post);
            showToast('Post eliminato.', 'info');
            onDeleted?.(post.$id);
        } catch (error) {
            console.error('deletePost:', error);
            showToast(error instanceof Error ? error.message : 'Eliminazione non riuscita.', 'error');
            setIsBusy(false);
        }
    };

    const isProfessional = author?.userType === 'professional';
    const authorName = author
        ? isProfessional
            ? `${(author as UserProfile).firstName || ''} ${(author as UserProfile).lastName || ''}`.trim() || 'Utente'
            : (author as StructureProfile).structureName || 'Struttura'
        : 'Membro di SwimIn';
    const authorSubtitle = author ? (isProfessional ? (author as UserProfile).title : (author as StructureProfile).structureType) : '';
    const authorAvatar = author ? (isProfessional ? (author as UserProfile).avatar : (author as StructureProfile).logo) : '';
    const displayAvatar = authorAvatar || initialsAvatar(authorName);

    const swimBadges = (() => {
        if (!author || !isProfessional || !(author as UserProfile).certificationsList) return [];
        const str = JSON.stringify((author as UserProfile).certificationsList).toLowerCase();
        const badges: { id: string; text: string; style: string }[] = [];
        if (str.includes('fin') || str.includes('federazione')) badges.push({ id: 'fin', text: 'FIN', style: 'bg-orange-100 text-orange-700 border-orange-200' });
        if (str.includes('salvamento') || str.includes('sns') || str.includes('bagnanti')) badges.push({ id: 'salvamento', text: 'Salvamento', style: 'bg-red-100 text-red-700 border-red-200' });
        return badges;
    })();

    const catStyle = post.category ? CATEGORY_STYLES[post.category] : undefined;
    const isVideoAnalysis = post.postType === 'video-analysis' && media.length > 0;
    const isLong = displayContent.length > COLLAPSED_LENGTH;
    const visibleText = isLong && !isExpanded ? cutText(displayContent, COLLAPSED_LENGTH) : displayContent;
    const wasEdited = !!post.editedAt;
    const openDetail = () => onSelectPost?.(post);

    return (
        <article className={`bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in duration-300 ${isBusy ? 'opacity-60 pointer-events-none' : ''}`}>
            {repostedBy && (
                <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <Icon type="share" className="w-3.5 h-3.5 text-corsia-600" />
                    <button className="hover:text-corsia-700 hover:underline" onClick={() => navigate(`/profile/${repostedBy.id}`)}>
                        {repostedBy.mine ? 'Hai' : repostedBy.name}
                    </button>
                    {repostedBy.mine ? 'ripubblicato questo post' : 'ha ripubblicato questo post'}
                </div>
            )}
            {post.recommendedBy && (
                <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2 text-xs font-bold text-slate-500">
                    <Icon type="thumb-up" className="w-3.5 h-3.5 text-blue-500" />
                    <button className="hover:text-blue-600 hover:underline" onClick={() => navigate(`/profile/${post.recommendedBy!.id}`)}>
                        {post.recommendedBy.name}
                    </button>
                    ha consigliato questo post
                </div>
            )}

            <div className="p-4 sm:p-5">
                <div className="flex items-start gap-3 mb-4">
                    <button onClick={() => navigate(`/profile/${post.authorId}`)} tabIndex={-1} aria-hidden="true" className="flex-shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                        <img src={displayAvatar} alt="" className="w-12 h-12 rounded-full object-cover border border-slate-100 hover:opacity-80 transition-opacity" />
                    </button>
                    <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                onClick={() => navigate(`/profile/${post.authorId}`)}
                                className="py-0.5 -my-0.5 font-bold text-slate-900 leading-tight hover:text-blue-600 transition-colors truncate text-left outline-none focus-visible:underline"
                            >
                                {authorName}
                            </button>
                            {isPremium(author) && <PremiumBadge />}
                            {swimBadges.map((b) => (
                                <span key={b.id} className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${b.style}`}>{b.text}</span>
                            ))}
                        </div>
                        {authorSubtitle && <p className="text-xs text-slate-500 mt-0.5 font-medium truncate">{authorSubtitle}</p>}
                        <div className="flex items-center flex-wrap gap-2 mt-1">
                            <time dateTime={post.$createdAt} title={new Date(post.$createdAt).toLocaleString('it-IT')} className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                                <Icon type="globe" className="w-3 h-3" /> {formatRelativeTime(post.$createdAt)}
                                {wasEdited && <span>· modificato</span>}
                            </time>
                            {catStyle && (
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border flex items-center gap-1 ${catStyle.style}`}>
                                    <Icon type={catStyle.icon} className="w-3 h-3" /> {catStyle.text}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="relative" ref={menuRef}>
                        <button
                            onClick={() => setIsMenuOpen((v) => !v)}
                            aria-label="Altre azioni"
                            aria-haspopup="menu"
                            aria-expanded={isMenuOpen}
                            className="p-2 -mr-2 -mt-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        >
                            <Icon type="ellipsis" className="w-5 h-5" />
                        </button>
                        {isMenuOpen && (
                            <div role="menu" className="absolute right-0 mt-1 w-52 bg-white border border-slate-200 rounded-xl shadow-xl z-20 py-1 animate-in fade-in zoom-in-95 duration-150">
                                <MenuItem icon="bookmark" label={isSaved('post', post.$id) ? 'Rimuovi dai salvati' : 'Salva'} onClick={() => { setIsMenuOpen(false); toggleSaved('post', post.$id); }} />
                                <MenuItem icon="link" label="Copia / condividi link" onClick={handleShare} />
                                {!isMine && (
                                    <MenuItem icon="alert-triangle" label="Segnala" onClick={() => { setIsMenuOpen(false); setIsReportOpen(true); }} />
                                )}
                                {!isMine && canModerate && <MenuItem icon="trash" label="Rimuovi dal gruppo" danger onClick={handleDelete} />}
                                {isMine && (
                                    <>
                                        <MenuItem icon="pencil" label="Modifica" onClick={() => { setIsMenuOpen(false); const ed = toEditable(displayContent); setDraft(ed.text); setEditMentions(ed.map); setIsEditing(true); }} />
                                        <MenuItem icon="trash" label="Elimina" danger onClick={handleDelete} />
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {isEditing ? (
                    <div className="mb-3">
                        <label htmlFor={`edit-${post.$id}`} className="sr-only">Testo del post</label>
                        <MentionTextarea
                            id={`edit-${post.$id}`}
                            value={draft}
                            onChange={setDraft}
                            mentions={editMentions}
                            onMentionsChange={setEditMentions}
                            maxLength={CONTENT_MAX_LENGTH}
                            rows={Math.min(12, Math.max(3, draft.split('\n').length + 1))}
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-[15px]"
                            autoFocus
                        />
                        <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-slate-400">{draft.length}/{CONTENT_MAX_LENGTH}</span>
                            <div className="flex gap-2">
                                <button onClick={() => setIsEditing(false)} className="px-4 py-1.5 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full">Annulla</button>
                                <button onClick={handleSaveEdit} disabled={!draft.trim() && media.length === 0} className="px-4 py-1.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-full disabled:opacity-50">Salva</button>
                            </div>
                        </div>
                    </div>
                ) : (
                    displayContent && (
                        <div className={media.length > 0 ? 'mb-3' : ''}>
                            <p className="text-slate-800 whitespace-pre-wrap break-words leading-relaxed text-[15px]"><RichText text={visibleText} /></p>
                            {isLong && (
                                <button onClick={() => setIsExpanded((v) => !v)} className="text-sm font-bold text-slate-500 hover:text-blue-600 mt-1">
                                    {isExpanded ? 'Mostra meno' : 'Altro'}
                                </button>
                            )}
                        </div>
                    )
                )}

                {(post.pollOptions || []).length > 0 && <PollView post={post} />}

                {post.repostOf && <EmbeddedOriginal postId={post.repostOf} />}

                {media.length > 0 && (
                    <div className={`grid gap-1 rounded-xl overflow-hidden relative ${media.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        {isVideoAnalysis && (
                            <button onClick={openDetail} className="absolute inset-0 bg-gradient-to-t from-purple-900/80 via-transparent to-transparent z-10 flex items-end p-4 text-left">
                                <span className="bg-purple-600/90 backdrop-blur-sm text-white px-3 py-1.5 rounded-lg border border-purple-400 shadow-lg flex items-center gap-2">
                                    <Icon type="camera" className="w-5 h-5" />
                                    <span className="font-bold text-sm">Video-analisi tecnica</span>
                                </span>
                            </button>
                        )}
                        {media.slice(0, 4).map((m, idx) =>
                            m.type === 'video' ? (
                                <video key={idx} src={m.url} controls={!isVideoAnalysis} preload="metadata" playsInline className="w-full max-h-[480px] bg-black object-contain" />
                            ) : (
                                <button key={idx} onClick={openDetail} className="relative block outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                                    <img src={m.url} alt={m.alt || 'Foto del post'} className={`w-full object-cover border border-slate-100 ${media.length > 1 ? 'aspect-square' : 'max-h-[520px]'}`} loading="lazy" />
                                    {idx === 3 && media.length > 4 && (
                                        <span className="absolute inset-0 bg-black/50 text-white text-2xl font-bold flex items-center justify-center">+{media.length - 4}</span>
                                    )}
                                </button>
                            )
                        )}
                    </div>
                )}

                {(likes > 0 || commentsCount > 0 || reposts > 0) && (
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-3 text-xs text-slate-500 font-medium">
                        {likes > 0 ? (
                            <button onClick={() => setIsLikesModalOpen(true)} className="py-1 -my-1 hover:text-corsia-700 hover:underline flex items-center gap-1.5">
                                <span className="flex -space-x-1" aria-hidden="true">
                                    {topReactions(counts).map((r) => (
                                        <span key={r.key} className="w-5 h-5 grid place-items-center rounded-full bg-white ring-2 ring-white text-sm leading-none">{r.emoji}</span>
                                    ))}
                                </span>
                                {likes === 1 && reaction ? 'Tu' : reaction ? `Tu e altri ${likes - 1}` : likes}
                            </button>
                        ) : <span />}
                        <span className="flex items-center gap-3">
                            {commentsCount > 0 && (
                                <button onClick={() => (onCommentClick ? onCommentClick() : setShowComments((v) => !v))} className="py-1.5 -my-1.5 hover:text-corsia-700 hover:underline">
                                    {commentsCount} {commentsCount === 1 ? 'commento' : 'commenti'}
                                </button>
                            )}
                            {reposts > 0 && <span>{reposts} {reposts === 1 ? 'ripubblicazione' : 'ripubblicazioni'}</span>}
                        </span>
                    </div>
                )}
            </div>

            <div className="px-2 py-1.5 bg-slate-50 border-t border-slate-200 flex justify-around gap-1">
                <ReactionButton value={reaction} disabled={isLiking || !user} onReact={handleReact} />
                <button
                    onClick={() => (onCommentClick ? onCommentClick() : isVideoAnalysis ? openDetail() : setShowComments((v) => !v))}
                    aria-expanded={isVideoAnalysis ? undefined : showComments}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-semibold rounded-lg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-corsia-500 ${isVideoAnalysis ? 'text-purple-600 hover:bg-purple-100' : showComments ? 'text-corsia-700 bg-corsia-50' : 'text-slate-600 hover:bg-slate-200 hover:text-slate-900'}`}
                >
                    <Icon type="chat-bubble" className="w-5 h-5" />
                    {isVideoAnalysis ? 'Analizza video' : 'Commenta'}
                </button>
                <div className="relative flex-1 flex" ref={repostRef}>
                    <button
                        onClick={() => setRepostOpen((v) => !v)}
                        disabled={!user}
                        aria-label="Ripubblica"
                        aria-haspopup="menu"
                        aria-expanded={repostOpen}
                        className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-semibold rounded-lg text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-corsia-500"
                    >
                        <Icon type="share" className="w-5 h-5" /> <span className="hidden sm:inline">Ripubblica</span>
                    </button>
                    {repostOpen && (
                        <div role="menu" className="absolute bottom-full right-0 mb-2 w-72 bg-white border border-slate-200 rounded-xl shadow-lift z-30 py-1 animate-in fade-in zoom-in-95 duration-150 origin-bottom-right">
                            {alreadyReposted ? (
                                <RepostItem icon="x" title="Annulla la ripubblicazione" text="Il post sparisce dal feed dei tuoi collegamenti." onClick={undoRepost} disabled={reposting} />
                            ) : (
                                <RepostItem icon="share" title="Ripubblica" text="Subito, con i tuoi collegamenti." onClick={() => doRepost()} disabled={reposting || alreadyReposted === null} />
                            )}
                            <RepostItem icon="pencil" title="Ripubblica con un tuo pensiero" text="Aggiungi un commento sopra al post." onClick={() => { setRepostOpen(false); setThoughtOpen(true); }} disabled={reposting} />
                            <RepostItem icon="link" title="Copia il link" text="Per inviarlo fuori da SwimIn." onClick={() => { setRepostOpen(false); void handleShare(); }} />
                        </div>
                    )}
                </div>
            </div>

            {showComments && !isVideoAnalysis && (
                <CommentsThread postId={post.$id} postAuthorId={post.authorId} autoFocus onCountChange={(d) => setCommentsCount((n) => Math.max(0, n + d))} />
            )}

            <FormModal
                open={thoughtOpen}
                title="Ripubblica con un pensiero"
                description="Il post comparirà sotto al tuo commento, nel feed dei tuoi collegamenti."
                icon="share"
                dirty={!!thought.trim()}
                busy={reposting}
                submitLabel="Ripubblica"
                busyLabel="Pubblicazione…"
                onClose={() => setThoughtOpen(false)}
                onSubmit={(e) => { e.preventDefault(); if (thought.trim()) void doRepost(thought.trim()); }}
            >
                <label htmlFor={`thought-${post.$id}`} className="sr-only">Il tuo pensiero</label>
                <textarea
                    id={`thought-${post.$id}`}
                    value={thought}
                    onChange={(e) => setThought(e.target.value.slice(0, 3000))}
                    rows={4}
                    autoFocus
                    placeholder="Perché lo consigli ai tuoi collegamenti?"
                    className="w-full p-3 rounded-xl border border-slate-200 focus:border-corsia-400 focus:ring-4 focus:ring-corsia-100 outline-none resize-none text-[15px]"
                />
                <p className="text-xs text-slate-400 text-right">{thought.length}/3000</p>
                <div className="rounded-xl border border-slate-200 p-3 bg-piastrella">
                    <p className="text-sm font-semibold text-abisso">{authorName}</p>
                    <p className="text-sm text-slate-600 line-clamp-3 whitespace-pre-wrap">{plainText(displayContent) || (media.length ? 'Post con foto o video' : '')}</p>
                </div>
            </FormModal>

            {isReportOpen && <ReportModal targetType="post" targetId={post.$id} onClose={() => setIsReportOpen(false)} />}
            {isLikesModalOpen && (
                <LikesModal postId={post.$id} onClose={() => setIsLikesModalOpen(false)} onNavigate={(view, id) => (view === 'messages' ? navigate('/messages', { state: { startChatWithUserId: id } }) : navigate(`/profile/${id}`))} />
            )}
        </article>
    );
};

const MenuItem: React.FC<{ icon: IconType; label: string; onClick: () => void; danger?: boolean }> = ({ icon, label, onClick, danger }) => (
    <button
        role="menuitem"
        onClick={onClick}
        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-left outline-none focus-visible:bg-slate-100 ${danger ? 'text-red-700 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50'}`}
    >
        <Icon type={icon} className="w-4 h-4" /> {label}
    </button>
);

const RepostItem: React.FC<{ icon: IconType; title: string; text: string; onClick: () => void; disabled?: boolean }> = ({ icon, title, text, onClick, disabled }) => (
    <button role="menuitem" onClick={onClick} disabled={disabled} className="w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-piastrella outline-none focus-visible:bg-piastrella disabled:opacity-50">
        <Icon type={icon} className="w-5 h-5 text-slate-500 mt-0.5 flex-shrink-0" />
        <span>
            <span className="block text-sm font-semibold text-abisso">{title}</span>
            <span className="block text-xs text-slate-500">{text}</span>
        </span>
    </button>
);

/** Ripubblicazione senza pensiero: l'originale, con l'intestazione "X ha ripubblicato". */
const PureRepost: React.FC<PostCardProps> = ({ post, ...rest }) => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [original, setOriginal] = useState<EnrichedPost | null | undefined>(undefined);
    const [reposter, setReposter] = useState<UserProfile | StructureProfile | null>(null);

    useEffect(() => {
        let alive = true;
        databaseService.getPost(post.repostOf!, user?.$id).then((p) => alive && setOriginal(p)).catch(() => alive && setOriginal(null));
        databaseService.getProfile(post.authorId).then((p) => alive && setReposter(p)).catch((err) => console.warn('Autore ripubblicazione:', err));
        return () => { alive = false; };
    }, [post.repostOf, post.authorId, user?.$id]);

    const mine = !!user && post.authorId === user.$id;
    if (original === undefined) return <div className="h-40 bg-white rounded-2xl border border-slate-200 animate-pulse" aria-hidden="true" />;
    if (original === null) {
        return (
            <article className="bg-white rounded-2xl border border-slate-200 p-5 text-sm text-slate-500 flex items-center justify-between gap-3">
                <span>{mine ? 'Hai ripubblicato' : `${displayNameOf(reposter)} ha ripubblicato`} un post che non è più disponibile.</span>
                {mine && (
                    <button
                        className="py-1 -my-1 font-semibold text-slate-600 hover:text-galleggiante-700"
                        onClick={async () => {
                            try { await databaseService.deletePost(post); rest.onDeleted?.(post.$id); } catch (err) { showToast(err instanceof Error ? err.message : 'Operazione non riuscita.', 'error'); }
                        }}
                    >
                        Rimuovi
                    </button>
                )}
            </article>
        );
    }
    return <PostCardBody {...rest} post={original} repostedBy={{ id: post.authorId, name: displayNameOf(reposter), repostId: post.$id, mine }} />;
};

/** Anteprima del post originale dentro una ripubblicazione con pensiero. */
const EmbeddedOriginal: React.FC<{ postId: string }> = ({ postId }) => {
    const navigate = useNavigate();
    const [original, setOriginal] = useState<EnrichedPost | null | undefined>(undefined);
    const [author, setAuthor] = useState<UserProfile | StructureProfile | null>(null);
    useEffect(() => {
        let alive = true;
        databaseService
            .getPost(postId)
            .then((p) => {
                if (!alive) return;
                setOriginal(p);
                return databaseService.getProfile(p.authorId).then((a) => alive && setAuthor(a));
            })
            .catch(() => alive && setOriginal(null));
        return () => { alive = false; };
    }, [postId]);
    if (original === undefined) return <div className="mt-3 h-24 rounded-xl bg-slate-100 animate-pulse" aria-hidden="true" />;
    if (original === null) return <p className="mt-3 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">Il post originale non è più disponibile.</p>;
    const { text, media } = getPostContent(original);
    return (
        // Il riquadro si apre con un clic; menzioni e hashtag restano link veri, e da tastiera c'è "Vedi il post originale".
        <div onClick={() => navigate(`/post/${original.$id}`)} className="mt-3 mb-1 rounded-xl border border-slate-200 hover:border-corsia-300 overflow-hidden transition-colors cursor-pointer">
            <div className="flex items-center gap-2 px-4 pt-3">
                <img src={avatarOf(author)} alt="" className="w-8 h-8 rounded-full object-cover" />
                <span className="min-w-0">
                    <Link to={`/profile/${original.authorId}`} onClick={(e) => e.stopPropagation()} className="block py-1 -my-1 text-sm font-semibold text-abisso truncate hover:underline">{displayNameOf(author)}</Link>
                    <span className="block text-[11px] text-slate-500">{formatRelativeTime(original.$createdAt)}</span>
                </span>
            </div>
            {text && <p className="px-4 pt-2 text-sm text-slate-700 whitespace-pre-wrap break-words line-clamp-4"><RichText text={text} /></p>}
            {media[0] && media[0].type !== 'video' && <img src={media[0].url} alt={media[0].alt || ''} className="w-full max-h-72 object-cover mt-3" loading="lazy" />}
            <p className="px-4 py-2.5">
                <Link to={`/post/${original.$id}`} onClick={(e) => e.stopPropagation()} className="py-1 -my-1 text-sm font-semibold text-corsia-700 hover:underline">Vedi il post originale</Link>
            </p>
        </div>
    );
};
