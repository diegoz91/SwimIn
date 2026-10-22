import React from 'react';
import { Models } from 'appwrite';
import type { UserProfile, StructureProfile } from '@/types/types';
import { initialsAvatar } from '@/utils/avatar';

export interface EnrichedComment extends Models.Document {
    postId: string;
    authorId: string;
    authorType: 'professional' | 'structure';
    content: string;
    parentCommentId: string | null;
    createdAt: string;
    author?: UserProfile | StructureProfile | null;
    replies?: EnrichedComment[];
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
    const deleteAction = onDelete?.(comment);
    let authorName = 'Utente Sconosciuto';
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
                        className="font-bold text-slate-800 text-sm cursor-pointer hover:text-blue-600 transition-colors line-clamp-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                        onClick={() => comment.authorId && onSelectProfile(comment.authorId)}
                    >
                        {authorName}
                    </button>
                    {authorSubtitle && (
                        <p className="text-xs text-slate-500 mb-1.5 line-clamp-1">{authorSubtitle}</p>
                    )}
                    <p className="text-slate-700 text-sm whitespace-pre-wrap break-words">
                        {comment.content}
                    </p>
                </div>
                
                <div className="flex items-center space-x-4 text-xs text-slate-500 mt-1.5 px-2">
                    {onLike && (
                        <button 
                            onClick={() => onLike(comment.$id)}
                            className="font-semibold hover:text-blue-600 transition-colors outline-none focus-visible:text-blue-600"
                        >
                            Mi piace
                        </button>
                    )}
                    {onReply && (
                        <button 
                            onClick={() => onReply(comment.$id, authorName)}
                            className="font-semibold hover:text-blue-600 transition-colors outline-none focus-visible:text-blue-600"
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
                            className="font-semibold text-slate-400 hover:text-red-600 transition-colors outline-none focus-visible:text-red-600"
                        >
                            Elimina
                        </button>
                    )}
                </div>

                {comment.replies && comment.replies.length > 0 && (
                     <div className="mt-3 space-y-3 pl-4 border-l-2 border-slate-200">
                        {comment.replies.map(reply => (
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