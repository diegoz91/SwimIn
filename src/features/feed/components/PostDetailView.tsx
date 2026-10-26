import React, { useState, useEffect, useRef } from 'react';
import type { EnrichedPost, Media } from '@/types/types';
import { PostCard } from './PostCard';
import { Comment, EnrichedComment } from './Comment';
import { useAuth } from '@/hooks/useAuth';
import { databaseService } from '@/services/database';
import { useToast } from '@/context/ToastContext';
import { Icon } from '@/components/ui/Icon';
import { getPostContent } from '@/utils/postMedia';
import { initialsAvatar } from '@/utils/avatar';
import { displayNameOf } from '@/utils/profile';
import { useBlocks } from '@/context/BlocksContext';
import { scrollPageTo } from '@/utils/scroll';
import { useConfirm } from '@/context/ConfirmContext';

interface PostDetailViewProps {
    post: EnrichedPost;
    onBack: () => void;
    onSelectProfile: (id: string) => void;
    backLabel?: string;
    onDeleted?: (postId: string) => void;
    onUpdated?: (post: EnrichedPost) => void;
}

export const PostDetailView: React.FC<PostDetailViewProps> = ({ post: initialPost, onBack, onSelectProfile, backLabel = 'Torna al feed', onDeleted, onUpdated }) => {
    const confirm = useConfirm();
    const { user } = useAuth();
    const [post, setPost] = useState(initialPost);
    useEffect(() => setPost(initialPost), [initialPost]);
    const { showToast } = useToast();
    const [comments, setComments] = useState<EnrichedComment[]>([]);
    const blocks = useBlocks();
    const [newCommentText, setNewCommentText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // STATI E REF PER VIDEO-ANALISI
    const videoRef = useRef<HTMLVideoElement>(null);
    const [selectedTimestamp, setSelectedTimestamp] = useState<number | null>(null);

    const { text: postText, media: extractedMedia } = getPostContent(post);
    const isVideoAnalysis = post.postType === 'video-analysis';
    const videoMedia = extractedMedia.find(m => m.type === 'video') || extractedMedia[0];

    // In modalità video-analisi il video è mostrato qui sotto: la card mostra solo il testo.
    const postForCard = (isVideoAnalysis && videoMedia) 
        ? { ...post, content: postText, media: [] } 
        : post;

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const loadComments = async () => {
        setIsLoading(true);
        try {
            const fetchedComments = await databaseService.getPostComments(post.$id, user?.$id);
            setComments(fetchedComments as unknown as EnrichedComment[]);
        } catch (error) {
            showToast("Impossibile caricare i commenti.", "error");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadComments();
    }, [post.$id]);

    const handlePublishComment = async () => {
        if (!user || (!newCommentText.trim() && selectedTimestamp === null) || isSubmitting) return;

        setIsSubmitting(true);
        try {
            const finalContent = selectedTimestamp !== null 
                ? `[TIME:${selectedTimestamp.toFixed(2)}] ${newCommentText.trim()}`
                : newCommentText.trim();

            await databaseService.createComment(post.$id, user.$id, finalContent);
            setPost((p) => ({ ...p, commentsCount: (p.commentsCount || 0) + 1 }));
            
            setNewCommentText('');
            setSelectedTimestamp(null);
            showToast("Commento pubblicato!", "success");
            await loadComments();
        } catch (error) {
            showToast("Impossibile pubblicare il commento. Riprova.", "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    /** Può eliminare: l'autore del commento o l'autore del post. */
    const canDeleteComment = (comment: EnrichedComment) =>
        !!user && (comment.authorId === user.$id || post.authorId === user.$id)
            ? async () => {
                if (!(await confirm({ title: 'Eliminare il commento?', confirmLabel: 'Elimina', tone: 'danger' }))) return;
                try {
                    await databaseService.deleteComment(comment.$id);
                    showToast('Commento eliminato.', 'info');
                    await loadComments();
                    setPost((p) => ({ ...p, commentsCount: Math.max(0, (p.commentsCount || 0) - 1 - (comment.replies?.length || 0)) }));
                } catch (error) {
                    showToast(error instanceof Error ? error.message : 'Eliminazione non riuscita.', 'error');
                }
            }
            : undefined;

    const currentUserAvatar = user 
        ? (user.userType === 'professional' ? user.avatar : user.logo) || 
          initialsAvatar(displayNameOf(user))
        : '';

    return (
        <div className="max-w-3xl mx-auto pb-20 md:pb-8 animate-in fade-in duration-500">
            <div className="sticky top-0 z-30 bg-slate-50/90 backdrop-blur-sm pb-4 pt-2 mb-2">
                <button 
                    onClick={onBack} 
                    className="inline-flex items-center text-slate-600 hover:text-blue-600 font-bold bg-white px-4 py-2 rounded-full shadow-sm border border-slate-200 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                    <Icon type="arrow-left" className="w-5 h-5 mr-2" />
                    {backLabel}
                </button>
            </div>

            <PostCard
                post={postForCard}
                onCommentClick={() => { const el = document.getElementById('detail-comment'); el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); el?.focus(); }}
                onDeleted={onDeleted}
                onUpdated={(updated) => { setPost(updated); onUpdated?.(updated); }}
            />

            {/* PLAYER VIDEO-ANALISI */}
            {isVideoAnalysis && videoMedia && (
                <div className="palette-fixed bg-slate-900 rounded-2xl shadow-xl border border-slate-800 overflow-hidden mt-4 mb-6 relative animate-in slide-in-from-top-4">
                    <div className="absolute top-4 left-4 z-10 bg-purple-600/90 backdrop-blur-md text-white px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-2 shadow-lg border border-purple-400">
                        <Icon type="camera" className="w-4 h-4 animate-pulse" />
                        MODALITÀ ANALISI TECNICA
                    </div>
                    <video
                        ref={videoRef}
                        src={videoMedia.url}
                        controls
                        playsInline
                        className="w-full max-h-[60vh] object-contain"
                    />
                </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mt-4">
                <div className="p-5 sm:p-6 border-b border-slate-100 bg-slate-50/50">
                    <h2 className="text-xl font-bold text-abisso">
                        Commenti <span className="text-slate-500 font-medium text-base ml-1">({comments.length})</span>
                    </h2>
                </div>
                
                {user ? (
                    <div className="p-5 sm:p-6 border-b border-slate-100 bg-white">
                        
                        {/* CATTURA FRAME */}
                        {isVideoAnalysis && (
                            <div className="flex flex-wrap items-center gap-2 mb-3 ml-12 sm:ml-16">
                                <button
                                    onClick={() => {
                                        if (videoRef.current) {
                                            videoRef.current.pause();
                                            setSelectedTimestamp(videoRef.current.currentTime);
                                        }
                                    }}
                                    className="bg-purple-50 text-purple-700 hover:bg-purple-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 border border-purple-200 outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                                >
                                    <Icon type="camera" className="w-4 h-4" /> Cattura Frame dal Video
                                </button>
                                {selectedTimestamp !== null && (
                                    <div className="bg-purple-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 shadow-sm animate-in zoom-in duration-200">
                                        ⏱ {formatTime(selectedTimestamp)}
                                        <button onClick={() => setSelectedTimestamp(null)} className="hover:text-purple-200 outline-none ml-1">
                                            <Icon type="x" className="w-3 h-3" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex items-start gap-3 sm:gap-4">
                            <img src={currentUserAvatar} alt="Il tuo avatar" className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover border border-slate-200 shadow-sm flex-shrink-0" />
                            <div className="flex-1">
                                <label htmlFor="detail-comment" className="sr-only">Scrivi un commento</label>
                                <textarea 
                                    id="detail-comment"
                                    placeholder={isVideoAnalysis ? "Aggiungi un'osservazione tecnica..." : "Scrivi un commento costruttivo..."}
                                    value={newCommentText}
                                    onChange={(e) => setNewCommentText(e.target.value)}
                                    disabled={isSubmitting}
                                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all resize-none text-[15px]"
                                    rows={3}
                                />
                                <div className="flex justify-end mt-3">
                                    <button 
                                        onClick={handlePublishComment}
                                        disabled={isSubmitting || (!newCommentText.trim() && selectedTimestamp === null)}
                                        className="bg-blue-600 text-white font-bold px-6 py-2 rounded-full hover:bg-blue-700 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                    >
                                        {isSubmitting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'Pubblica'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="p-6 text-center bg-slate-50"><p className="text-slate-600 font-medium">Devi accedere per poter commentare.</p></div>
                )}

                <div className="p-5 sm:p-6 bg-white">
                    {isLoading ? (
                        <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-300 border-t-blue-600"></div></div>
                    ) : comments.length > 0 ? (
                        <div className="space-y-6">
                            {comments.filter((c) => !blocks.isHidden(c.authorId)).map(comment => {
                                const timeMatch = comment.content.match(/^\[TIME:([\d.]+)\]\s*([\s\S]*)/);
                                let displayComment = comment;
                                let timeVal: number | null = null;

                                if (timeMatch) {
                                    timeVal = parseFloat(timeMatch[1]);
                                    displayComment = { ...comment, content: timeMatch[2] };
                                }

                                return (
                                    <div key={comment.$id} className="relative group pt-1">
                                        {timeVal !== null && (
                                            <div className="absolute top-0 right-0 sm:top-2 sm:right-2 z-10">
                                                <button
                                                    onClick={() => {
                                                        if(videoRef.current) {
                                                            videoRef.current.currentTime = timeVal!;
                                                            videoRef.current.play();
                                                            scrollPageTo(0, true);
                                                        }
                                                    }}
                                                    className="bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-600 hover:text-white px-2.5 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 outline-none focus-visible:ring-2 focus-visible:ring-purple-500 group-hover:scale-105"
                                                >
                                                    <Icon type="play" className="w-3 h-3 sm:w-4 sm:h-4" /> 
                                                    Vai al sec. {formatTime(timeVal)}
                                                </button>
                                            </div>
                                        )}
                                        <Comment comment={displayComment} onSelectProfile={onSelectProfile} onDelete={canDeleteComment} />
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-10"><p className="text-slate-500 text-lg">Ancora nessun commento: scrivi il primo.</p></div>
                    )}
                </div>
            </div>
        </div>
    );
};