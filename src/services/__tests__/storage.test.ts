import { describe, expect, it } from 'vitest';
import { parseFileUrl } from '@/services/storage';

describe('parseFileUrl', () => {
    it('estrae bucket e file da un URL del nostro storage', () => {
        const url = 'https://cloud.appwrite.io/v1/storage/buckets/avatars/files/abc123/view?project=test-project';
        expect(parseFileUrl(url)).toEqual({ bucketId: 'avatars', fileId: 'abc123' });
    });

    it('ignora URL esterni (non vanno mai cancellati)', () => {
        expect(parseFileUrl('https://ui-avatars.com/api/?name=Mario')).toBeNull();
        expect(parseFileUrl('https://evil.example/v1/storage/buckets/avatars/files/abc/view')).toBeNull();
        expect(parseFileUrl(null)).toBeNull();
    });
});
