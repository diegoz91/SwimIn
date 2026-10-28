import { describe, expect, it } from 'vitest';
import { normalizeInvite } from './invite';

describe('normalizeInvite', () => {
    it('maiuscolo, senza spazi e trattini', () => {
        expect(normalizeInvite(' nuoto-2026 ')).toBe('NUOTO2026');
    });
    it('vuoto per valori mancanti e tronca a 16 caratteri', () => {
        expect(normalizeInvite(null)).toBe('');
        expect(normalizeInvite('a'.repeat(30))).toHaveLength(16);
    });
});
