import React, { useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { storageService } from '@/services/storage';
import { useToast } from '@/context/ToastContext';

interface ImageUploadButtonProps {
    kind: 'avatar' | 'cover';
    /** URL dell'immagine attuale: dopo il caricamento della nuova viene eliminata dallo storage. */
    currentUrl?: string | null;
    /** Salva il nuovo URL (es. aggiornando il profilo). Se lancia un errore il file caricato viene rimosso. */
    onUploaded: (url: string) => Promise<void> | void;
    label: string;
    className?: string;
}

/**
 * Pulsante "fotocamera" sovrapposto ad avatar o copertina: sceglie un file,
 * lo comprime, lo carica e sostituisce l'immagine precedente.
 */
export const ImageUploadButton: React.FC<ImageUploadButtonProps> = ({ kind, currentUrl, onUploaded, label, className = '' }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const { showToast } = useToast();

    const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = ''; // permette di riselezionare lo stesso file
        if (!file) return;

        setIsUploading(true);
        let newUrl: string | null = null;
        try {
            newUrl = await storageService.uploadProfileImage(file, kind);
            await onUploaded(newUrl);
            if (currentUrl && currentUrl !== newUrl) void storageService.deleteByUrl(currentUrl);
            showToast(kind === 'cover' ? 'Copertina aggiornata.' : 'Foto aggiornata.', 'success');
        } catch (error) {
            console.error('Caricamento immagine:', error);
            if (newUrl) void storageService.deleteByUrl(newUrl);
            showToast(error instanceof Error ? error.message : 'Caricamento non riuscito.', 'error');
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <>
            <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleChange}
                aria-hidden="true"
                tabIndex={-1}
            />
            <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={isUploading}
                aria-label={label}
                title={label}
                data-html2canvas-ignore="true"
                className={`inline-flex items-center justify-center gap-2 rounded-full bg-white/95 text-slate-700 shadow-md border border-slate-200 hover:bg-white hover:text-blue-600 transition disabled:opacity-70 outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500 ${className}`}
            >
                {isUploading ? (
                    <span className="w-4 h-4 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
                ) : (
                    <Icon type="camera" className="w-4 h-4" />
                )}
                {kind === 'cover' && <span className="text-xs font-bold hidden sm:inline">{isUploading ? 'Caricamento…' : 'Cambia copertina'}</span>}
            </button>
        </>
    );
};
