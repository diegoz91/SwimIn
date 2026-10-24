import React, { useState } from 'react';
import { Models } from 'appwrite';
import type { UserProfile, StructureProfile } from '@/types/types';
import { initialsAvatar } from '@/utils/avatar';
import { useBlocks } from '@/context/BlocksContext';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/context/ToastContext';
import { databaseService } from '@/services/database';
import { Icon } from '@/components/ui/Icon';
import { RichText } from '@/utils/richText';

export interface EnrichedComment extends Models.Document {
    postId: string;
    authorId: string;
    authorType: 'professional' | 'structure';
    content: string;
    parentCommentId: string | null;
    createdAt: string;
    author?: UserProfile | StructureProfile | null;
    replies?: EnrichedComment[];
    likesCount?: number;
    likedByMe?: boolean;
}

interface CommentProps {
    comment: EnrichedComment;
    onSelectProfile: (userId: string) => void;
    onReply?: (commentId: string, authorName: string) => void;
    onLike?: (commentId: string) => void;
    /** Restituisce l'azione di eliminazione se l'utente può eliminare il commento. */
    onDelete?: (comment: EnrichedComment) => (() => void) | undefined;
}

export const Comment: React.FC<CommentProps> = ({ 
    comment, 
    onSelectProfile,
    onReply,
    onLike,
    onDelete,
}) => {
    const blocks = useBlocks();
    const { user } = useAuth();
    const { showToast } = useToast();
    const deleteAction = onDelete?.(comment);
    const [liked, setLiked] = useState(!!comment.likedByMe);
    const [likes, setLikes] = useState(comment.likesCount || 0);
    const [liking, setLiking] = useState(false);

    const toggleLike = async () => {
        if (!user || liking) return;
        setLiking(true);
        const was = liked;
        setLiked(!was);
        setLikes((n) => Math.max(0, n + (was ? -1 : 1)));
        try {
            const res = await databaseService.toggleCommentLike(comment.$id);
            setLiked(res.liked);
            setLikes(res.likesCount);
            onLike?.(comment.$id);
        } catch (err) {
            console.error('Mi piace al commento:', err);
            setLiked(was);
            setLikes(comment.likesCount || 0);
            showToast('Non è stato possibile registrare il mi piace.', 'error');
        } finally {
            setLiking(false);
        }
    };
    let authorName = 'Utente sconosciuto';
    let authorSubtitle = '';
    let avatarUrl = '';

    if (comment.author) {
        if (comment.authorType === 'professional') {
            const prof = comment.author as UserProfile;
            authorName = `${prof.firstName || ''} ${prof.lastName || ''}`.trim() || 'Utente';
            authorSubtitle = prof.title || 'Professionista';
            avatarUrl = prof.avatar || '';
        } else {
            const struct = comment.author as StructureProfile;
            authorName = struct.structureName || 'Struttura';
            authorSubtitle = struct.structureType || 'Piscina';
            avatarUrl = struct.logo || '';
        }
    }

    const displayAvatar = avatarUrl || initialsAvatar(authorName);

    const formatTimeAgo = (isoString: string) => {
        const date = new Date(isoString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'Ora';
        if (diffMins < 60) return `${diffMins} min fa`;
        if (diffHours < 24) return `${diffHours} h fa`;
        if (diffDays < 7) return `${diffDays} gg fa`;
        return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
    };

    return (
        <div className="flex items-start space-x-3 group animate-in fade-in duration-300">
            <img 
                src={displayAvatar}
                alt={`Avatar di ${authorName}`}
                className="w-10 h-10 rounded-full object-cover cursor-pointer border border-slate-200 shadow-sm transition-transform hover:scale-105"
                onClick={() => comment.authorId && onSelectProfile(comment.authorId)}
                loading="lazy"
            />
            <div className="flex-1 min-w-0">
                <div className="bg-slate-100 rounded-2xl p-3 inline-block min-w-[50%] max-w-full">
                    <button 
                        className="py-0.5 -my-0.5 font-bold text-slate-800 text-sm cursor-pointer hover:text-blue-600 transition-colors line-clamp-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                        onClick={() => comment.authorId && onSelectProfile(comment.authorId)}
                    >
                        {authorName}
                    </button>
                    {authorSubtitle && (
                        <p className="text-xs text-slate-500 mb-1.5 line-clamp-1">{authorSubtitle}</p>
                    )}
                    <p className="text-slate-700 text-sm whitespace-pre-wrap break-words">
                        <RichText text={comment.content} />
                    </p>
                </div>
                
                <div className="flex items-center space-x-4 text-xs text-slate-500 mt-1.5 px-2">
                    {user && (
                        <button
                            onClick={toggleLike}
                            disabled={liking}
                            aria-pressed={liked}
                            className={`py-1.5 -my-1.5 font-semibold transition-colors outline-none focus-visible:text-corsia-700 ${liked ? 'text-corsia-700' : 'hover:text-corsia-700'}`}
                        >
                            {liked ? 'Ti piace' : 'Mi piace'}
                        </button>
                    )}
                    {likes > 0 && (
                        <span className="inline-flex items-center gap-1 text-slate-500" aria-label={likes === 1 ? '1 mi piace' : `${likes} mi piace`}>
                            <span className="bg-corsia-100 p-0.5 rounded-full"><Icon type="thumb-up" className="w-2.5 h-2.5 text-corsia-700" /></span>
                            {likes}
                        </span>
                    )}
                    {onReply && (
                        <button 
                            onClick={() => onReply(comment.$id, authorName)}
                            className="py-1.5 -my-1.5 font-semibold hover:text-blue-600 transition-colors outline-none focus-visible:text-blue-600"
                        >
                            Rispondi
                        </button>
                    )}
                    <span className="text-slate-400" title={new Date(comment.createdAt).toLocaleString('it-IT')}>
                        {formatTimeAgo(comment.createdAt)}
                    </span>
                    {deleteAction && (
                        <button
                            onClick={deleteAction}
                            className="font-semibold text-slate-400 hover:text-red-700 transition-colors outline-none focus-visible:text-red-700"
                        >
                            Elimina
                        </button>
                    )}
                </div>

                {comment.replies && comment.replies.length > 0 && (
                     <div className="mt-3 space-y-3 pl-4 border-l-2 border-slate-200">
                        {comment.replies.filter((reply) => !blocks.isHidden(reply.authorId)).map(reply => (
                            <Comment 
                                key={reply.$id} 
                                comment={reply} 
                                onSelectProfile={onSelectProfile} 
                                onReply={onReply}
                                onLike={onLike}
                                onDelete={onDelete}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};