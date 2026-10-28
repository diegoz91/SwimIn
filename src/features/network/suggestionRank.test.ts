import { describe, expect, it } from 'vitest';
import type { StructureProfile, UserProfile } from '@/types/types';
import { rankSuggestions } from './suggestionRank';

const pro = (id: string, over: Partial<UserProfile> = {}) => ({ $id: id, userId: id, userType: 'professional', connections: [], ...over }) as UserProfile;
const pool = (id: string, over: Partial<StructureProfile> = {}) => ({ $id: id, userId: id, userType: 'structure', connections: [], ...over }) as StructureProfile;
const cert = (name: string) => JSON.stringify({ name });

describe('rankSuggestions', () => {
    const me = pro('me', { connections: ['a', 'b'], province: 'MI', city: 'Segrate', title: 'Istruttore FIN', certificationsList: [cert('Brevetto SNS')] });

    it('esclude sé stessi, i collegamenti e i sospesi', () => {
        const out = rankSuggestions(me, [me, pro('a'), pro('z', { suspended: true }), pro('x')]);
        expect(out.map((r) => r.profile.$id)).toEqual(['x']);
    });

    it('collegamenti in comune contano più della provincia', () => {
        const out = rankSuggestions(me, [pro('vicino', { province: 'MI' }), pro('amico', { connections: ['a', 'b'] }), pro('nessuno')]);
        expect(out.map((r) => r.profile.$id)).toEqual(['amico', 'vicino', 'nessuno']);
        expect(out[0].reason).toBe('2 collegamenti in comune');
        expect(out[2].reason).toBe('');
    });

    it('stessa città, ruolo e brevetti; le strutture vicine per chi lavora in vasca', () => {
        const out = rankSuggestions(me, [
            pro('collega', { province: 'MI', city: 'Segrate', title: 'istruttore fin', certificationsList: [cert('brevetto sns')] }),
            pool('piscina', { province: 'mi' }),
            pro('lontano', { province: 'TO', title: 'Istruttore FIN' }),
        ]);
        expect(out.map((r) => r.profile.$id)).toEqual(['collega', 'piscina', 'lontano']);
        expect(out[0].reason).toBe('Anche a Segrate');
        expect(out[1].score).toBe(3);
        expect(out[2].reason).toBe('Stesso ruolo');
    });

    it('a parità resta l’ordine ricevuto', () => {
        expect(rankSuggestions(me, [pro('p1'), pro('p2'), pro('p3')]).map((r) => r.profile.$id)).toEqual(['p1', 'p2', 'p3']);
    });
});
