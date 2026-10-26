import { ID, type Models } from 'appwrite';
import { account, storage } from '@/services/appwrite';
import { APPWRITE_CONFIG } from '@/config/constants';

export type ProgressFn = (percent: number) => void;

let jwt: { token: string; until: number } | null = null;
/** JWT della sessione (vale 15 minuti): per scaricare file privati e caricare con avanzamento. */
export async function sessionJwt(): Promise<string> {
    if (jwt && jwt.until > Date.now()) return jwt.token;
    const { jwt: token } = await account.createJWT();
    jwt = { token, until: Date.now() + 10 * 60_000 };
    return token;
}

const CHUNK = 5 * 1024 * 1024;

/**
 * Carica un file con la percentuale reale. Fino a 5 MB una sola richiesta, di cui il browser
 * misura i byte inviati; oltre, i pezzi da 5 MB dell'SDK di Appwrite (avanzamento a ogni pezzo,
 * il caricamento riprende dal pezzo interrotto).
 */
export async function uploadFile(bucketId: string, file: File, permissions?: string[], onProgress?: ProgressFn): Promise<Models.File> {
    onProgress?.(0);
    if (file.size > CHUNK || !onProgress) {
        const res = await storage.createFile({ bucketId, fileId: ID.unique(), file, permissions, onProgress: onProgress ? (p) => onProgress(Math.min(99, Math.round(p.progress))) : undefined });
        onProgress?.(100);
        return res;
    }
    const token = await sessionJwt();
    const form = new FormData();
    form.append('fileId', ID.unique());
    form.append('file', file);
    for (const p of permissions || []) form.append('permissions[]', p);
    return await new Promise<Models.File>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${APPWRITE_CONFIG.endpoint}/storage/buckets/${encodeURIComponent(bucketId)}/files`);
        xhr.setRequestHeader('X-Appwrite-Project', APPWRITE_CONFIG.projectId);
        xhr.setRequestHeader('X-Appwrite-JWT', token);
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100))); };
        xhr.onload = () => {
            let body: { message?: string } & Partial<Models.File> = {};
            try { body = JSON.parse(xhr.responseText || '{}'); } catch { body = {}; }
            if (xhr.status >= 200 && xhr.status < 300) { onProgress(100); resolve(body as Models.File); }
            else reject(new Error(body.message || 'Caricamento non riuscito. Riprova.'));
        };
        xhr.onerror = () => reject(new Error('Connessione interrotta durante il caricamento. Riprova.'));
        xhr.send(form);
    });
}
