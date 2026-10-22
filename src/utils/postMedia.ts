import type { Media, Post } from '@/types/types';

const LEGACY_MEDIA_BLOCK = /\[MEDIA\](.*?)\[\/MEDIA\]/s;

const isMedia = (value: unknown): value is Media =>
    !!value &&
    typeof value === 'object' &&
    typeof (value as Media).url === 'string' &&
    ((value as Media).type === 'image' || (value as Media).type === 'video');

/** Serializza i media per il campo `media` del post (array di stringhe JSON). */
export const serializeMedia = (media: Media[]): string[] => media.map((m) => JSON.stringify(m));

/**
 * Restituisce testo e media di un post. Legge il campo `media`; per i post
 * creati con la versione precedente estrae anche il blocco `[MEDIA]...[/MEDIA]`
 * che veniva accodato al testo.
 */
export const getPostContent = (post: Pick<Post, 'content' | 'media'>): { text: string; media: Media[] } => {
    const media: Media[] = [];
    for (const raw of post.media || []) {
        try {
            const parsed: unknown = JSON.parse(raw);
            if (isMedia(parsed)) media.push(parsed);
        } catch {
            console.warn('Media del post non leggibile, ignorato:', raw);
        }
    }

    let text = post.content || '';
    const legacy = text.match(LEGACY_MEDIA_BLOCK);
    if (legacy) {
        text = text.replace(legacy[0], '').trim();
        try {
            const parsed: unknown = JSON.parse(legacy[1]);
            if (Array.isArray(parsed)) media.push(...parsed.filter(isMedia));
        } catch {
            console.warn('Blocco [MEDIA] legacy non leggibile, ignorato.');
        }
    }

    return { text, media };
};
