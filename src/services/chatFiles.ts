import { Permission, Role } from 'appwrite';
import { storage } from '@/services/appwrite';
import { sessionJwt, uploadFile, type ProgressFn } from '@/services/upload';
import { APPWRITE_CONFIG } from '@/config/constants';
import { compressImage } from '@/utils/image';
import type { ChatAttachment } from '@/types/types';
// Funzioni pure (senza Appwrite), in un modulo a parte così si possono provare nei test.
export { isImageAttachment, parseAttachments, messagePreview } from '@/utils/chatPreview';

/**
 * Allegati dei messaggi, nel bucket privato `chat_files`.
 * Il file si carica leggibile solo da chi lo invia; all'invio la Function lo rende
 * leggibile anche al destinatario. Per mostrarlo si scarica con un JWT della sessione
 * (funziona anche quando il browser blocca i cookie di terze parti).
 */
const MB = 1024 * 1024;
export const CHAT_MAX_MB = 10;
export const CHAT_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf,.doc,.docx,.xls,.xlsx';
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const DOC_TYPES: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
const bucket = APPWRITE_CONFIG.buckets.chatFiles;


export const formatFileSize = (bytes: number) =>
    bytes >= MB ? `${(bytes / MB).toLocaleString('it-IT', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`;

/** Carica un allegato (le foto vengono ridimensionate) e ne restituisce l'id. */
export async function uploadChatFile(file: File, userId: string, onProgress?: ProgressFn): Promise<string> {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const isImage = IMAGE_TYPES.includes(file.type);
    if (!isImage && !DOC_TYPES[ext]) throw new Error('Puoi allegare foto (JPG, PNG, WebP), PDF, Word o Excel.');
    if (file.size > (isImage ? 25 : CHAT_MAX_MB) * MB) throw new Error(`Il file supera i ${CHAT_MAX_MB} MB.`);
    const toUpload = isImage ? await compressImage(file, { maxSize: 2000 }) : file;
    if (toUpload.size > CHAT_MAX_MB * MB) throw new Error(`Il file supera i ${CHAT_MAX_MB} MB.`);
    const uploaded = await uploadFile(bucket, toUpload, [Permission.read(Role.user(userId)), Permission.delete(Role.user(userId))], onProgress);
    return uploaded.$id;
}

/** Elimina un allegato caricato ma non inviato. */
export async function discardChatFile(fileId: string) {
    try {
        await storage.deleteFile(bucket, fileId);
    } catch (err) {
        console.warn('Allegato non eliminato:', err);
    }
}

const blobCache = new Map<string, Promise<string>>();

/**
 * URL locale (blob:) di un file di un bucket privato, scaricato con il JWT della sessione;
 * in cache per la sessione. Usato per allegati della chat e CV.
 */
export function privateFileUrl(bucketId: string, fileId: string, mode: 'preview' | 'view' = 'view'): Promise<string> {
    const key = `${bucketId}:${mode}:${fileId}`;
    const cached = blobCache.get(key);
    if (cached) return cached;
    const p = (async () => {
        const path = mode === 'preview' ? `preview?width=640&quality=80&output=webp` : 'view';
        const res = await fetch(`${APPWRITE_CONFIG.endpoint}/storage/buckets/${bucketId}/files/${encodeURIComponent(fileId)}/${path}`, {
            headers: { 'X-Appwrite-Project': APPWRITE_CONFIG.projectId, 'X-Appwrite-JWT': await sessionJwt() },
        });
        if (!res.ok) throw new Error(res.status === 404 ? 'File non più disponibile.' : 'File non disponibile.');
        return URL.createObjectURL(await res.blob());
    })();
    blobCache.set(key, p);
    p.catch(() => blobCache.delete(key));
    return p;
}

/** URL locale (blob:) di un allegato, per <img> o per aprirlo. */
export const chatFileUrl = (fileId: string, mode: 'preview' | 'view' = 'view') => privateFileUrl(bucket, fileId, mode);

/** Scarica l'allegato con il suo nome originale. */
export async function downloadChatFile(a: ChatAttachment) {
    const url = await chatFileUrl(a.fileId, 'view');
    const link = document.createElement('a');
    link.href = url;
    link.download = a.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
}

/** Testo breve per l'elenco delle conversazioni (allegati ed eliminati compresi). */
