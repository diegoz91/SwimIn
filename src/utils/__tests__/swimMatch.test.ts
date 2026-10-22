import { describe, expect, it } from 'vitest';
import { swimMatchScore } from '@/utils/swimMatch';

const cert = (name: string, issuer: string, category = '') => JSON.stringify({ name, issuer, category });

const giulia = {
    title: 'Istruttrice FIN di nuoto',
    certificationsList: [cert('Brevetto Assistente Bagnanti', 'Società Nazionale di Salvamento'), cert('BLSD esecutore', 'IRC')],
    experienceList: [JSON.stringify({ role: 'Istruttrice', facility: 'Piscina Lido', description: 'Corsi bambini' })],
    skills: ['Scuola nuoto bambini'],
};

describe('swimMatchScore', () => {
    it('riconosce i brevetti anche con nomi diversi (SNS = salvamento)', () => {
        expect(swimMatchScore(giulia, { requirements: [], qualificationsRequired: ['Brevetto Salvamento'] })).toBe(100);
    });

    it('calcola la percentuale sui requisiti soddisfatti', () => {
        expect(
            swimMatchScore(giulia, { requirements: ['Esperienza con bambini', 'Patente nautica'], qualificationsRequired: ['Istruttore FIN', 'BLSD'] })
        ).toBe(75);
    });

    it('restituisce null se l\'annuncio non ha requisiti', () => {
        expect(swimMatchScore(giulia, { requirements: [], qualificationsRequired: [] })).toBeNull();
    });

    it('restituisce 0 per un profilo vuoto', () => {
        expect(swimMatchScore({}, { requirements: ['Brevetto Salvamento'], qualificationsRequired: [] })).toBe(0);
    });
});
