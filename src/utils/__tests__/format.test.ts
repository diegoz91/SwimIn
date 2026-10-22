import { describe, expect, it } from 'vitest';
import { formatCount, formatRelativeTime } from '@/utils/format';

const NOW = new Date('2026-10-22T12:00:00Z');
const ago = (seconds: number) => new Date(NOW.getTime() - seconds * 1000).toISOString();

describe('formatRelativeTime', () => {
    it('mostra "ora" per meno di un minuto', () => {
        expect(formatRelativeTime(ago(20), NOW)).toBe('ora');
    });

    it('usa minuti, ore e giorni in italiano', () => {
        expect(formatRelativeTime(ago(5 * 60), NOW)).toBe('5 minuti fa');
        expect(formatRelativeTime(ago(3 * 3600), NOW)).toBe('3 ore fa');
        expect(formatRelativeTime(ago(86400), NOW)).toBe('ieri');
    });

    it('oltre una settimana mostra la data', () => {
        const label = formatRelativeTime('2026-09-01T10:00:00Z', NOW);
        expect(label).toMatch(/1 set/);
        expect(label).not.toMatch(/2026/); // stesso anno: niente anno
        expect(formatRelativeTime('2025-03-01T10:00:00Z', NOW)).toMatch(/2025/);
    });
});

describe('formatCount', () => {
    it('separa le migliaia e abbrevia i grandi numeri', () => {
        expect(formatCount(1200)).toBe('1200');
        expect(formatCount(9999)).toBe('9999');
        expect(formatCount(15300)).toBe('15,3K');
        expect(formatCount(2_500_000)).toBe('2,5 Mln');
    });
});
