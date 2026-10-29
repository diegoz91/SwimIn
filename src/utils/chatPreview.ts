import type { ChatAttachment } from '@/types/types';

/** Allegati dei messaggi e anteprima testuale: funzioni pure, riusate da chat, widget e notifiche. */
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

export function messagePreview(m: { content?: string | null; attachments?: string[] | null; deleted?: boolean | null }): string {
    if (m.deleted) return 'Messaggio eliminato';
    if (m.content) return m.content;
    const files = parseAttachments(m.attachments);
    if (!files.length) return '';
    if (files.length === 1) return isImageAttachment(files[0]) ? 'Foto' : files[0].name;
    return `${files.length} allegati`;
}
