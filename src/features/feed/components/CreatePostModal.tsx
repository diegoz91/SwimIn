import React, { useState, useRef, useEffect } from 'react';
import type { UserProfile, StructureProfile, Media } from '@/types/types';
import { Icon } from '@/components/ui/Icon';
import { PhotoUploader } from '@/features/profile/components/PhotoUploader';
import { storageService } from '@/services/storage';
import { useToast } from '@/context/ToastContext';
import { initialsAvatar } from '@/utils/avatar';

interface CreatePostModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreatePost: (content: string, media: Media[], category: string, mode?: 'photo' | 'video' | 'video-analysis' | null) => Promise<void> | void;
    user: UserProfile | StructureProfile;
    initialMediaType?: 'photo' | 'video' | 'video-analysis' | null;
}

const CATEGORIES = [
    { id: 'generale', label: 'Generale', icon: 'globe' },
    { id: 'allenamento', label: 'Allenamento', icon: 'clock' },
    { id: 'gara', label: 'Gare e risultati', icon: 'star' },
    { id: 'tecnica', label: 'Tecnica e formazione', icon: 'certificate' },
    { id: 'normative', label: 'Normative e sicurezza', icon: 'info' },
    { id: 'pensiero', label: 'Pensieri', icon: 'chat-bubble' },
    { id: 'esperienza', label: 'Esperienze in vasca', icon: 'heart' },
];

export const CreatePostModal: React.FC<CreatePostModalProps> = ({ 
    isOpen, onClose, onCreatePost, user, initialMediaType 
}) => {
    const [content, setContent] = useState('');
    const [mediaFiles, setMediaFiles] = useState<{ file: File, preview: string, alt: string }[]>([]);
    // 💡 FIX VERCEL: Esteso il tipo per lo stato
    const [mediaType, setMediaType] = useState<'photo' | 'video' | 'video-analysis' | null>(initialMediaType || null);
    const [selectedCategory, setSelectedCategory] = useState('generale');
    const [uploading, setUploading] = useState(false);
    const [videoFile, setVideoFile] = useState<{ file: File; preview: string } | null>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);
    const isVideoMode = mediaType === 'video' || mediaType === 'video-analysis';

    useEffect(() => () => { if (videoFile) URL.revokeObjectURL(videoFile.preview); }, [videoFile]);

    const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (file.size > 50 * 1024 * 1024) {
            showToast('Video troppo grande: il limite è 50 MB.', 'error');
            return;
        }
        setVideoFile({ file, preview: URL.createObjectURL(file) });
    };
    
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const { showToast } = useToast();

    useEffect(() => {
        if (isOpen) setTimeout(() => textareaRef.current?.focus(), 100);
    }, [isOpen]);

    const isProfessional = user.userType === 'professional';
    const authorName = isProfessional ? `${(user as UserProfile).firstName || ''} ${(user as UserProfile).lastName || ''}`.trim() : (user as StructureProfile).structureName;
    const avatarUrl = isProfessional ? (user as UserProfile).avatar : (user as StructureProfile).logo;
    const displayAvatar = avatarUrl || initialsAvatar(authorName || 'U');

    const handleSafeClose = () => {
        if (content.trim() !== '' || mediaFiles.length > 0 || videoFile) {
            if (window.confirm("Hai un post in sospeso. Sei sicuro di voler annullare?")) onClose();
        } else {
            onClose();
        }
    };

    const handleCreatePost = async () => {
        if (!content.trim() && mediaFiles.length === 0 && !videoFile) return;
        if (mediaType === 'video-analysis' && !videoFile) {
            showToast('Per una video-analisi carica un video.', 'error');
            return;
        }
        setUploading(true);
        try {
            let uploadedMedia: Media[] = [];
            if (isVideoMode && videoFile) {
                const url = await storageService.uploadPostMedia(videoFile.file);
                uploadedMedia = [{ type: 'video', url }];
            } else if (mediaFiles.length > 0) {
                const uploadPromises = mediaFiles.map(async (mediaFile) => {
                    const uploadedUrl = await storageService.uploadPostMedia(mediaFile.file);
                    return { type: 'image' as const, url: uploadedUrl, alt: mediaFile.alt };
                });
                uploadedMedia = await Promise.all(uploadPromises);
            }
            await onCreatePost(content.trim(), uploadedMedia, selectedCategory, mediaType);
            showToast('Post pubblicato con successo!', 'success');
        } catch (error) {
            console.error('Pubblicazione post:', error);
            showToast(error instanceof Error && error.message ? error.message : 'Errore durante la pubblicazione.', 'error');
        } finally {
            setUploading(false);
        }
    };

    if (!isOpen) return null;
    const isPostButtonDisabled = (content.trim() === '' && mediaFiles.length === 0 && !videoFile) || uploading;

    return (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-75 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-opacity duration-200" onClick={handleSafeClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50/50 rounded-t-2xl">
                    <h2 className="text-xl font-extrabold text-slate-800">Crea un post</h2>
                    <button onClick={handleSafeClose} disabled={uploading} className="text-slate-400 hover:text-slate-700 hover:bg-slate-200 p-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-slate-500">
                        <Icon type="x" className="w-6 h-6" />
                    </button>
                </div>
                
                <div className="p-5 overflow-y-auto custom-scrollbar flex-1 relative">
                    <div className="flex items-center mb-5">
                        <img src={displayAvatar} alt="Avatar" className="w-12 h-12 rounded-full mr-3 object-cover border border-slate-100" />
                        <div>
                            <p className="font-bold text-slate-800 leading-tight">{authorName}</p>
                            <div className="flex flex-wrap gap-2 mt-1">
                                {CATEGORIES.map(cat => (
                                    <button 
                                        key={cat.id}
                                        onClick={() => setSelectedCategory(cat.id)}
                                        className={`flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded border transition-colors ${selectedCategory === cat.id ? 'bg-blue-100 text-blue-700 border-blue-200 shadow-sm' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`}
                                    >
                                        <Icon type={cat.icon as any} className="w-3 h-3" /> {cat.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <textarea
                        ref={textareaRef}
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="Condividi un pensiero, un traguardo o una novità..."
                        className="w-full border-none focus:ring-0 text-lg sm:text-xl p-0 text-slate-800 placeholder-slate-400 resize-none outline-none min-h-[120px] bg-transparent"
                        disabled={uploading}
                        maxLength={4000}
                        aria-label="Testo del post"
                    />
                    {content.length > 3500 && (
                        <p className="text-right text-xs text-slate-400">{content.length}/4000</p>
                    )}

                    {isVideoMode && (
                        <div className="mt-4 animate-in fade-in duration-300">
                            {mediaType === 'video-analysis' && (
                                <p className="text-sm text-purple-700 bg-purple-50 border border-purple-200 rounded-xl px-3 py-2 mb-3">
                                    <strong>Video-analisi:</strong> chi commenta potrà fermare il video e lasciare osservazioni legate a un istante preciso.
                                </p>
                            )}
                            <input ref={videoInputRef} type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden" onChange={handleVideoChange} />
                            {videoFile ? (
                                <div className="relative rounded-xl overflow-hidden bg-black">
                                    <video src={videoFile.preview} controls playsInline className="w-full max-h-80 object-contain" />
                                    <button onClick={() => setVideoFile(null)} disabled={uploading} className="absolute top-2 right-2 p-1.5 bg-white/90 rounded-full text-slate-700 hover:text-red-600" aria-label="Rimuovi video">
                                        <Icon type="x" className="w-5 h-5" />
                                    </button>
                                </div>
                            ) : (
                                <button onClick={() => videoInputRef.current?.click()} disabled={uploading} className="w-full border-2 border-dashed border-blue-300 bg-blue-50 hover:bg-blue-100 rounded-xl p-8 text-center transition">
                                    <Icon type="video" className="w-10 h-10 mx-auto mb-2 text-blue-500" />
                                    <span className="block font-semibold text-blue-700">Scegli un video</span>
                                    <span className="block text-xs text-slate-500 mt-1">MP4, MOV o WebM · max 50 MB</span>
                                </button>
                            )}
                        </div>
                    )}

                    {mediaType === 'photo' && (
                        <div className="mt-4 animate-in fade-in duration-300">
                            <PhotoUploader files={mediaFiles} setFiles={setMediaFiles} disabled={uploading} />
                        </div>
                    )}

                    {uploading && (
                        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center z-10 animate-in fade-in">
                            <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-200 border-t-blue-600 mb-3"></div>
                            <p className="font-bold text-blue-800">Pubblicazione in corso...</p>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-slate-100 mt-auto bg-white rounded-b-2xl flex justify-between items-center">
                     <div className="flex items-center space-x-1">
                        <button onClick={() => setMediaType(mediaType === 'photo' ? null : 'photo')} disabled={uploading} aria-label="Aggiungi foto" title="Foto" className={`p-2.5 rounded-full ${mediaType === 'photo' ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-100'}`}>
                            <Icon type="photo" className="w-6 h-6"/>
                        </button>
                        <button onClick={() => setMediaType(mediaType === 'video' ? null : 'video')} disabled={uploading} aria-label="Aggiungi video" title="Video" className={`p-2.5 rounded-full ${mediaType === 'video' ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-100'}`}>
                            <Icon type="video" className="w-6 h-6"/>
                        </button>
                        <button onClick={() => setMediaType(mediaType === 'video-analysis' ? null : 'video-analysis')} disabled={uploading} aria-label="Video-analisi tecnica" title="Video-analisi tecnica" className={`p-2.5 rounded-full ${mediaType === 'video-analysis' ? 'bg-purple-50 text-purple-600' : 'text-slate-500 hover:bg-slate-100'}`}>
                            <Icon type="camera" className="w-6 h-6"/>
                        </button>
                     </div>
                     <button onClick={handleCreatePost} disabled={isPostButtonDisabled} className="bg-blue-600 text-white font-bold px-6 py-2.5 rounded-full hover:bg-blue-700 disabled:opacity-50">
                        {uploading ? 'Attendere...' : 'Pubblica'}
                    </button>
                </div>
            </div>
        </div>
    );
};