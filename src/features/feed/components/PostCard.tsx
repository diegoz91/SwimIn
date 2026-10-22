import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { databaseService } from '@/services/database';
import { useToast } from '@/context/ToastContext';
import type { EnrichedPost, UserProfile, StructureProfile } from '@/types/types';
import { Icon, type IconType } from '@/components/ui/Icon';
import { LikesModal } from './LikesModal';
import { getPostContent } from '@/utils/postMedia';
import { formatRelativeTime } from '@/utils/format';

interface PostCardProps {
    post: EnrichedPost;
    onSelectPost?: (post: EnrichedPost) => void;
    /** Chiamato dopo l'eliminazione del post da parte dell'autore. */
    onDeleted?: (postId: string) => void;
    /** Chiamato dopo una modifica, con il post aggiornato. */
    onUpdated?: (post: EnrichedPost) => void;
}

const CATEGORY_STYLES: Record<string, { icon: IconType; text: string; style: string }> = {
    allenamento: { icon: 'clock', text: 'Allenamento', style: 'bg-blue-50 text-blue-600 border-blue-200' },
    gara: { icon: 'star', text: 'Gara & Risultati', style: 'bg-amber-50 text-amber-600 border-amber-200' },
    tecnica: { icon: 'certificate', text: 'Tecnica & Formazione', style: 'bg-purple-50 text-purple-600 border-purple-200' },
    normative: { icon: 'info', text: 'Normative & Sicurezza', style: 'bg-red-50 text-red-600 border-red-200' },
};

const CONTENT_MAX_LENGTH = 4000;
const COLLAPSED_LENGTH = 400;

export const PostCard: React.FC<PostCardProps> = ({ post, onSelectPost, onDeleted, onUpdated }) => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { showToast } = useToast();

    const [likes, setLikes] = useState(post.likesCount || 0);
    const [liked, setLiked] = useState(!!post.likedByMe);
    const [isLiking, setIsLiking] = useState(false);
    const [isLikesModalOpen, setIsLikesModalOpen] = useState(false);
    const [author, setAuthor] = useState<UserProfile | StructureProfile | null>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isBusy, setIsBusy] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const { text: displayContent, media } = getPostContent(post);
    const [draft, setDraft] = useState(displayContent);
    const isMine = !!user && post.authorId === user.$id;

    useEffect(() => {
        setLikes(post.likesCount || 0);
        setLiked(!!post.likedByMe);
    }, [post.likesCount, post.likedByMe]);

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

    const handleLike = async () => {
        if (!user || isLiking) return;
        setIsLiking(true);
        // Aggiornamento ottimistico, poi allineamento con il valore del server.
        const wasLiked = liked;
        setLiked(!wasLiked);
        setLikes((n) => Math.max(0, n + (wasLiked ? -1 : 1)));
        try {
            const res = await databaseService.toggleLike(post.$id, user.$id);
            setLiked(res.liked);
            setLikes(res.likesCount);
        } catch (error) {
            console.error('toggleLike:', error);
            setLiked(wasLiked);
            setLikes(post.likesCount || 0);
            showToast('Non è stato possibile registrare il consiglio.', 'error');
        } finally {
            setIsLiking(false);
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
        const content = draft.trim();
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
        if (!window.confirm('Eliminare definitivamente questo post? Verranno rimossi anche commenti e consigli.')) return;
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
    const displayAvatar = authorAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(authorName)}&background=eff6ff&color=1d4ed8`;

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
    const visibleText = isLong && !isExpanded ? `${displayContent.slice(0, COLLAPSED_LENGTH).trimEnd()}…` : displayContent;
    const wasEdited = !!post.editedAt;
    const openDetail = () => onSelectPost?.(post);

    return (
        <article className={`bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in duration-300 ${isBusy ? 'opacity-60 pointer-events-none' : ''}`}>
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
                    <button onClick={() => navigate(`/profile/${post.authorId}`)} className="flex-shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                        <img src={displayAvatar} alt="" className="w-12 h-12 rounded-full object-cover border border-slate-100 hover:opacity-80 transition-opacity" />
                    </button>
                    <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                onClick={() => navigate(`/profile/${post.authorId}`)}
                                className="font-bold text-slate-900 leading-tight hover:text-blue-600 transition-colors truncate text-left outline-none focus-visible:underline"
                            >
                                {authorName}
                            </button>
                            {swimBadges.map((b) => (
                                <span key={b.id} className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded border ${b.style}`}>{b.text}</span>
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
                                <MenuItem icon="link" label="Copia / condividi link" onClick={handleShare} />
                                {isMine && (
                                    <>
                                        <MenuItem icon="pencil" label="Modifica" onClick={() => { setIsMenuOpen(false); setDraft(displayContent); setIsEditing(true); }} />
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
                        <textarea
                            id={`edit-${post.$id}`}
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
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
                            <p className="text-slate-800 whitespace-pre-wrap break-words leading-relaxed text-[15px]">{visibleText}</p>
                            {isLong && (
                                <button onClick={() => setIsExpanded((v) => !v)} className="text-sm font-bold text-slate-500 hover:text-blue-600 mt-1">
                                    {isExpanded ? 'Mostra meno' : 'Altro'}
                                </button>
                            )}
                        </div>
                    )
                )}

                {media.length > 0 && (
                    <div className={`grid gap-1 rounded-xl overflow-hidden relative ${media.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        {isVideoAnalysis && (
                            <button onClick={openDetail} className="absolute inset-0 bg-gradient-to-t from-purple-900/80 via-transparent to-transparent z-10 flex items-end p-4 text-left">
                                <span className="bg-purple-600/90 backdrop-blur-sm text-white px-3 py-1.5 rounded-lg border border-purple-400 shadow-lg flex items-center gap-2">
                                    <Icon type="camera" className="w-5 h-5" />
                                    <span className="font-extrabold text-sm uppercase tracking-wider">Video-analisi tecnica</span>
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
                                        <span className="absolute inset-0 bg-black/50 text-white text-2xl font-extrabold flex items-center justify-center">+{media.length - 4}</span>
                                    )}
                                </button>
                            )
                        )}
                    </div>
                )}

                {(likes > 0 || post.commentsCount > 0) && (
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
                        {likes > 0 ? (
                            <button onClick={() => setIsLikesModalOpen(true)} className="hover:text-blue-600 hover:underline flex items-center gap-1.5">
                                <span className="bg-blue-100 p-1 rounded-full"><Icon type="thumb-up" className="w-3 h-3 text-blue-600" /></span>
                                {likes} {likes === 1 ? 'consiglio' : 'consigli'}
                            </button>
                        ) : <span />}
                        {post.commentsCount > 0 && (
                            <button onClick={openDetail} className="hover:text-blue-600 hover:underline">
                                {post.commentsCount} {post.commentsCount === 1 ? 'commento' : 'commenti'}
                            </button>
                        )}
                    </div>
                )}
            </div>

            <div className="px-2 py-1.5 bg-slate-50 border-t border-slate-200 flex justify-around">
                <button
                    onClick={handleLike}
                    disabled={isLiking || !user}
                    aria-pressed={liked}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-semibold rounded-lg transition-all outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${liked ? 'text-blue-600 hover:bg-blue-50' : 'text-slate-600 hover:bg-slate-200 hover:text-slate-900'}`}
                >
                    <Icon type="thumb-up" className={`w-5 h-5 transition-transform ${liked ? 'scale-110 fill-blue-100' : ''}`} /> {liked ? 'Consigliato' : 'Consiglia'}
                </button>
                <button
                    onClick={openDetail}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-semibold rounded-lg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${isVideoAnalysis ? 'text-purple-600 hover:bg-purple-100' : 'text-slate-600 hover:bg-slate-200 hover:text-slate-900'}`}
                >
                    <Icon type="chat-bubble" className="w-5 h-5" />
                    {isVideoAnalysis ? 'Analizza video' : 'Commenta'}
                </button>
                <button
                    onClick={handleShare}
                    className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-semibold rounded-lg text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                    <Icon type="share" className="w-5 h-5" /> <span className="hidden sm:inline">Condividi</span>
                </button>
            </div>

            {isLikesModalOpen && (
                <LikesModal postId={post.$id} onClose={() => setIsLikesModalOpen(false)} onNavigate={(view, id) => navigate(`/${view}/${id}`)} />
            )}
        </article>
    );
};

const MenuItem: React.FC<{ icon: IconType; label: string; onClick: () => void; danger?: boolean }> = ({ icon, label, onClick, danger }) => (
    <button
        role="menuitem"
        onClick={onClick}
        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-left outline-none focus-visible:bg-slate-100 ${danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50'}`}
    >
        <Icon type={icon} className="w-4 h-4" /> {label}
    </button>
);
