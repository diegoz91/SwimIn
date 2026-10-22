import { describe, expect, it } from 'vitest';
import { getPostContent, serializeMedia } from '@/utils/postMedia';
import type { Media } from '@/types/types';

const photo: Media = { type: 'image', url: 'https://example.com/a.jpg', alt: 'vasca' };
const video: Media = { type: 'video', url: 'https://example.com/b.mp4' };

describe('getPostContent', () => {
    it('legge i media dal campo dedicato', () => {
        const result = getPostContent({ content: 'Allenamento di oggi', media: serializeMedia([photo, video]) });
        expect(result.text).toBe('Allenamento di oggi');
        expect(result.media).toEqual([photo, video]);
    });

    it('legge i post creati con il vecchio formato [MEDIA] nel testo', () => {
        const content = `Gara regionale\n\n[MEDIA]${JSON.stringify([photo])}[/MEDIA]`;
        const result = getPostContent({ content, media: [] });
        expect(result.text).toBe('Gara regionale');
        expect(result.media).toEqual([photo]);
    });

    it('ignora media malformati senza far fallire il post', () => {
        const result = getPostContent({ content: 'ok', media: ['{non json', JSON.stringify({ type: 'pdf', url: 'x' })] });
        expect(result.text).toBe('ok');
        expect(result.media).toEqual([]);
    });
});
