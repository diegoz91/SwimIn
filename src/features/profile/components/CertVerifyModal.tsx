import React, { useEffect, useRef, useState } from 'react';
import type { Certification, UserProfile } from '@/types/types';
import { FormModal } from '@/components/form/FormModal';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/context/ToastContext';
import { storageService } from '@/services/storage';
import { databaseService } from '@/services/database';

/**
 * Richiesta di verifica di un brevetto: si carica una foto o un PDF del documento,
 * che resta privato (lo vede solo lo staff di SwimIn per la verifica).
 */
export const CertVerifyModal: React.FC<{ open: boolean; cert?: Certification; userId: string; onClose: () => void; onDone: (profile: Partial<UserProfile>) => void }> = ({
    open, cert, userId, onClose, onDone,
}) => {
    const { showToast } = useToast();
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!open) return;
        setFile(null);
        setError(null);
        setPreview(null);
    }, [open]);

    useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

    const pick = (f?: File) => {
        setError(null);
        if (!f) return;
        if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(f.type)) return setError('Carica una foto (JPG, PNG, WebP) o un PDF.');
        if (f.size > 8 * 1024 * 1024) return setError('Il file supera gli 8 MB.');
        setFile(f);
        setPreview(f.type.startsWith('image/') ? URL.createObjectURL(f) : null);
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!cert?.id) return setError('Salva prima il brevetto, poi chiedi la verifica.');
        if (!file) return setError('Scegli il file del brevetto.');
        setBusy(true);
        try {
            const fileId = await storageService.uploadCertificateDocument(file, userId);
            await databaseService.requestCertVerification(cert.id, fileId);
            const profile = await databaseService.getProfile(userId);
            onDone(profile as Partial<UserProfile>);
            showToast('Richiesta inviata: ti avviseremo appena il brevetto sarà verificato.', 'success');
            onClose();
        } catch (err) {
            console.error('Verifica brevetto:', err);
            setError(err instanceof Error ? err.message : 'Invio non riuscito. Riprova.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <FormModal
            open={open}
            title="Verifica il brevetto"
            description={cert ? `${cert.name}, ${cert.issuer}` : undefined}
            icon="shield"
            dirty={!!file}
            busy={busy}
            submitLabel="Invia per la verifica"
            busyLabel="Invio…"
            onClose={onClose}
            onSubmit={submit}
        >
            <p className="text-sm text-slate-600">
                Carica una foto leggibile o il PDF del brevetto. Il documento è <strong>privato</strong>: lo vede solo lo staff di SwimIn per confrontarlo con i dati
                inseriti. Una volta verificato, sul tuo profilo comparirà il bollino.
            </p>
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} aria-label="Scegli il file del brevetto" />
            <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}
                className={`w-full rounded-2xl border-2 border-dashed p-6 text-center transition-colors outline-none focus-visible:ring-4 focus-visible:ring-corsia-100 ${error ? 'border-galleggiante bg-red-50/40' : 'border-slate-300 hover:border-corsia-400 bg-piastrella'}`}
            >
                {preview ? (
                    <img src={preview} alt="Anteprima del brevetto" className="max-h-56 mx-auto rounded-lg shadow-card" />
                ) : file ? (
                    <span className="inline-flex items-center gap-2 font-semibold text-abisso"><Icon type="document" className="w-6 h-6 text-corsia-600" /> {file.name}</span>
                ) : (
                    <span className="block">
                        <Icon type="camera" className="w-8 h-8 mx-auto text-slate-400" />
                        <span className="block mt-2 font-semibold text-abisso">Scatta o scegli una foto, oppure un PDF</span>
                        <span className="block text-xs text-slate-500 mt-1">Fino a 8 MB</span>
                    </span>
                )}
            </button>
            {file && <button type="button" onClick={() => inputRef.current?.click()} className="text-sm font-semibold text-corsia-700 hover:underline">Cambia file</button>}
            {error && <p className="text-sm text-galleggiante flex items-center gap-1.5"><Icon type="alert-triangle" className="w-4 h-4" /> {error}</p>}
        </FormModal>
    );
};
