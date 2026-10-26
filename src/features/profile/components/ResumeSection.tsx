import React, { useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { useMyResume } from '@/hooks/useMyResume';
import { downloadResume, openResume, resumeFileError, RESUME_MAX_MB } from '@/services/resume';
import { formatFileSize } from '@/services/chatFiles';
import { formatRelativeTime } from '@/utils/format';
import { UploadProgress } from '@/components/common/UploadProgress';

/**
 * Il tuo CV (solo sul tuo profilo): un PDF che vedi solo tu e che alleghi alle candidature.
 * Si carica con il pulsante o trascinando il file; sostituirlo non cambia i CV già inviati.
 */
export const ResumeSection: React.FC = () => {
    const { resume, busy, progress, upload, remove } = useMyResume();
    const { showToast } = useToast();
    const confirm = useConfirm();
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);
    const [opening, setOpening] = useState(false);

    const pick = () => inputRef.current?.click();
    const handleFile = async (file?: File | null) => {
        if (!file) return;
        const error = resumeFileError(file);
        if (error) return showToast(error, 'error');
        try {
            await upload(file);
            showToast(resume ? 'CV aggiornato. Le candidature già inviate restano con il CV di allora.' : 'CV caricato: ora puoi allegarlo alle candidature in un clic.', 'success');
        } catch (err) {
            console.error('CV:', err);
            showToast(err instanceof Error && err.message ? err.message : 'Il CV non è stato caricato. Riprova.', 'error');
        }
    };

    const handleRemove = async () => {
        if (!resume) return;
        const ok = await confirm({ title: 'Eliminare il CV?', message: 'Non potrai più allegarlo alle nuove candidature. Le strutture a cui l’hai già inviato continuano a vederlo.', confirmLabel: 'Elimina', tone: 'danger' });
        if (!ok) return;
        try {
            await remove();
            showToast('CV eliminato.', 'success');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Eliminazione non riuscita.', 'error');
        }
    };

    const withFile = async (fn: () => Promise<void>) => {
        setOpening(true);
        try {
            await fn();
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Il CV non è disponibile.', 'error');
        } finally {
            setOpening(false);
        }
    };

    const btn = 'inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-60';

    return (
        <section className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 sm:p-8 mb-6" aria-labelledby="resume-title">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div className="min-w-0">
                    <h2 id="resume-title" className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                        <Icon type="document" className="w-6 h-6 text-blue-600" /> Curriculum vitae
                    </h2>
                    <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
                        <Icon type="lock-closed" className="w-4 h-4 flex-shrink-0" /> Lo vedi solo tu. Lo ricevono le strutture a cui ti candidi allegandolo.
                    </p>
                </div>
            </div>

            <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => { void handleFile(e.target.files?.[0]); e.target.value = ''; }}
            />

            {progress !== null && <UploadProgress value={progress} label="Caricamento del CV" className="mb-4" />}

            {resume === undefined ? (
                <div className="h-20 rounded-2xl bg-slate-100 animate-pulse" aria-label="Caricamento del CV" />
            ) : resume ? (
                <div className="rounded-2xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="w-12 h-14 rounded-lg bg-red-50 border border-red-100 text-galleggiante-700 grid place-items-center flex-shrink-0 text-xs font-bold" aria-hidden="true">PDF</span>
                        <div className="min-w-0">
                            <p className="font-semibold text-abisso break-all">{resume.name}</p>
                            <p className="text-sm text-slate-500">
                                {formatFileSize(resume.size)}{resume.updatedAt ? ` · aggiornato ${formatRelativeTime(resume.updatedAt)}` : ''}
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => withFile(() => openResume(resume.fileId))} disabled={opening || busy} className={`${btn} bg-corsia-600 text-white hover:bg-corsia-700`}>
                            <Icon type="eye" className="w-4 h-4" /> Apri
                        </button>
                        <button type="button" onClick={() => withFile(() => downloadResume(resume.fileId, resume.name))} disabled={opening || busy} className={`${btn} border border-slate-300 text-abisso hover:bg-slate-50`}>
                            <Icon type="download" className="w-4 h-4" /> Scarica
                        </button>
                        <button type="button" onClick={pick} disabled={busy} className={`${btn} border border-slate-300 text-abisso hover:bg-slate-50`}>
                            {busy ? <span className="w-4 h-4 border-2 border-slate-300 border-t-corsia-600 rounded-full animate-spin" aria-hidden="true" /> : <Icon type="arrow-path" className="w-4 h-4" />}
                            {busy ? 'Caricamento…' : 'Sostituisci'}
                        </button>
                        <button type="button" onClick={handleRemove} disabled={busy} className={`${btn} text-galleggiante-700 hover:bg-red-50`}>
                            <Icon type="trash" className="w-4 h-4" /> Elimina
                        </button>
                    </div>
                </div>
            ) : (
                <div
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => { e.preventDefault(); setDragging(false); void handleFile(e.dataTransfer.files?.[0]); }}
                    className={`rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${dragging ? 'border-corsia-500 bg-corsia-50' : 'border-slate-300'}`}
                >
                    <Icon type="document" className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    <p className="font-semibold text-abisso">Aggiungi il tuo CV</p>
                    <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                        Con il CV ti candidi in un clic: la struttura lo riceve insieme al profilo, brevetti ed esperienze. PDF fino a {RESUME_MAX_MB} MB.
                    </p>
                    <button type="button" onClick={pick} disabled={busy} className={`${btn} mt-4 bg-corsia-600 text-white hover:bg-corsia-700`}>
                        {busy ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" aria-hidden="true" /> : <Icon type="plus" className="w-4 h-4" />}
                        {busy ? 'Caricamento…' : 'Carica il CV'}
                    </button>
                    <p className="hidden sm:block text-xs text-slate-500 mt-2">oppure trascina qui il file</p>
                </div>
            )}
        </section>
    );
};
