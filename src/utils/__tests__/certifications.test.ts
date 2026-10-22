import { describe, expect, it } from 'vitest';
import { certificationsNeedingAttention, describeExpiry } from '@/utils/certifications';

const today = new Date(2026, 9, 22); // 22 ottobre 2026
const cert = (name: string, expiry?: string) => JSON.stringify({ name, issuer: 'X', category: 'salvamento', expiry });

describe('certificationsNeedingAttention', () => {
    it('restituisce scaduti e in scadenza, dal più urgente', () => {
        const list = [cert('Valido', '2027-06-30'), cert('Tra 20 giorni', '2026-11-11'), cert('Scaduto', '2026-10-01'), cert('Senza scadenza')];
        const result = certificationsNeedingAttention(list, today);
        expect(result.map((c) => c.name)).toEqual(['Scaduto', 'Tra 20 giorni']);
        expect(result[0].state).toBe('expired');
        expect(result[1].daysLeft).toBe(20);
    });

    it('ignora voci non leggibili', () => {
        expect(certificationsNeedingAttention(['{rotto', ''], today)).toEqual([]);
    });
});

describe('describeExpiry', () => {
    it('descrive la scadenza in italiano', () => {
        const [expired, soon] = certificationsNeedingAttention([cert('A', '2026-10-21'), cert('B', '2026-10-23')], today);
        expect(describeExpiry(expired)).toBe('Scaduto da 1 giorno');
        expect(describeExpiry(soon)).toBe('Scade tra 1 giorno');
    });
});
