import { ID, Permission, Role } from 'appwrite';
import { account, storage } from '@/services/appwrite';
import { APPWRITE_CONFIG } from '@/config/constants';
import { compressImage } from '@/utils/image';
import type { ChatAttachment } from '@/types/types';

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

export const isImageAttachment = (a: Pick<ChatAttachment, 'mime'>) => a.mime.startsWith('image/');

export function parseAttachments(raw?: string[] | null): ChatAttachment[] {
    const out: ChatAttachment[] = [];
    for (const r of raw || []) {
        try {
            const a = JSON.parse(r) as ChatAttachment;
            if (a && typeof a.fileId === 'string') out.push(a);
        } catch (err) {
            console.warn('Allegato non leggibile:', err);
        }
    }
    return out;
}

export const formatFileSize = (bytes: number) =>
    bytes >= MB ? `${(bytes / MB).toLocaleString('it-IT', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`;

/** Carica un allegato (le foto vengono ridimensionate) e ne restituisce l'id. */
export async function uploadChatFile(file: File, userId: string): Promise<string> {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const isImage = IMAGE_TYPES.includes(file.type);
    if (!isImage && !DOC_TYPES[ext]) throw new Error('Puoi allegare foto (JPG, PNG, WebP), PDF, Word o Excel.');
    if (file.size > (isImage ? 25 : CHAT_MAX_MB) * MB) throw new Error(`Il file supera i ${CHAT_MAX_MB} MB.`);
    const toUpload = isImage ? await compressImage(file, { maxSize: 2000 }) : file;
    if (toUpload.size > CHAT_MAX_MB * MB) throw new Error(`Il file supera i ${CHAT_MAX_MB} MB.`);
    const uploaded = await storage.createFile(bucket, ID.unique(), toUpload, [Permission.read(Role.user(userId)), Permission.delete(Role.user(userId))]);
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

let jwt: { token: string; until: number } | null = null;
async function sessionJwt() {
    if (jwt && jwt.until > Date.now()) return jwt.token;
    const { jwt: token } = await account.createJWT();
    jwt = { token, until: Date.now() + 10 * 60_000 }; // il JWT vale 15 minuti
    return token;
}

const blobCache = new Map<string, Promise<string>>();

/** URL locale (blob:) di un allegato, per <img> o per aprirlo; in cache per la sessione. */
export function chatFileUrl(fileId: string, mode: 'preview' | 'view' = 'view'): Promise<string> {
    const key = `${mode}:${fileId}`;
    const cached = blobCache.get(key);
    if (cached) return cached;
    const p = (async () => {
        const path = mode === 'preview' ? `preview?width=640&quality=80&output=webp` : 'view';
        const res = await fetch(`${APPWRITE_CONFIG.endpoint}/storage/buckets/${bucket}/files/${encodeURIComponent(fileId)}/${path}`, {
            headers: { 'X-Appwrite-Project': APPWRITE_CONFIG.projectId, 'X-Appwrite-JWT': await sessionJwt() },
        });
        if (!res.ok) throw new Error(res.status === 404 ? 'Allegato non più disponibile.' : 'Allegato non disponibile.');
        return URL.createObjectURL(await res.blob());
    })();
    blobCache.set(key, p);
    p.catch(() => blobCache.delete(key));
    return p;
}

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
export function messagePreview(m: { content?: string | null; attachments?: string[] | null; deleted?: boolean | null }): string {
    if (m.deleted) return 'Messaggio eliminato';
    if (m.content) return m.content;
    const files = parseAttachments(m.attachments);
    if (!files.length) return '';
    if (files.length === 1) return isImageAttachment(files[0]) ? 'Foto' : files[0].name;
    return `${files.length} allegati`;
}
