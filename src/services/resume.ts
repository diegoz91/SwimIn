import { Permission, Role } from 'appwrite';
import { storage } from '@/services/appwrite';
import { APPWRITE_CONFIG } from '@/config/constants';
import { databaseService } from '@/services/database';
import { privateFileUrl } from '@/services/chatFiles';
import { uploadFile, type ProgressFn } from '@/services/upload';
import type { ResumeInfo } from '@/types/types';

/**
 * CV personale (PDF fino a 5 MB) nel bucket privato `resumes`. Il file si carica leggibile solo
 * da sé; la Function lo controlla e lo registra (functions/api/src/resume.js). Con una
 * candidatura la struttura riceve una copia, quindi cambiarlo non tocca quelle già inviate.
 */
export const RESUME_MAX_MB = 5;
const bucket = APPWRITE_CONFIG.buckets.resumes;

/** Controllo prima di caricare: messaggio d'errore in italiano, oppure null. */
export function resumeFileError(file: File): string | null {
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf) return 'Il CV deve essere un file PDF. Da Word o Pages usa "Esporta come PDF".';
    if (file.size > RESUME_MAX_MB * 1024 * 1024) return `Il file pesa più di ${RESUME_MAX_MB} MB: esporta il PDF in qualità ridotta e riprova.`;
    if (file.size < 1024) return 'Il file sembra vuoto: controlla di aver scelto il PDF giusto.';
    return null;
}

/** Carica il PDF e lo imposta come CV; il precedente viene sostituito. */
export async function uploadResume(file: File, userId: string, onProgress?: ProgressFn): Promise<ResumeInfo> {
    const error = resumeFileError(file);
    if (error) throw new Error(error);
    const uploaded = await uploadFile(bucket, file, [Permission.read(Role.user(userId)), Permission.delete(Role.user(userId))], onProgress);
    try {
        return await databaseService.setMyResume(uploaded.$id);
    } catch (err) {
        await storage.deleteFile(bucket, uploaded.$id).catch((e) => console.warn('CV non registrato, file non eliminato:', e));
        throw err;
    }
}

/** Apre il PDF in una nuova scheda (la scheda si apre subito, così il browser non la blocca). */
export async function openResume(fileId: string): Promise<void> {
    const tab = window.open('', '_blank');
    try {
        const url = await privateFileUrl(bucket, fileId);
        if (tab) tab.location.href = url;
        else window.location.assign(url);
    } catch (err) {
        tab?.close();
        throw err;
    }
}

/** Scarica il PDF con il suo nome. */
export async function downloadResume(fileId: string, name: string): Promise<void> {
    const url = await privateFileUrl(bucket, fileId);
    const link = document.createElement('a');
    link.href = url;
    link.download = /\.pdf$/i.test(name) ? name : `${name}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
}
