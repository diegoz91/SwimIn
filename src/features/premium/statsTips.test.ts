import { describe, expect, it } from 'vitest';
import type { ProfileStats } from '@/services/database';
import type { StructureProfile, UserProfile } from '@/types/types';
import { changeOf, statsTips } from './statsTips';

const stats = (over: Partial<ProfileStats> = {}): ProfileStats => ({
    viewsLast30: 10, viewsPerDay: [], viewersByKind: { strutture: 0, professionisti: 0, appassionati: 0 }, viewersByRole: [], viewersByProvince: [],
    anonymousViews: 0, searchesLast30: 0, searchersByKind: { strutture: 0, professionisti: 0, appassionati: 0 }, posts: [], postsLast30: 2,
    totals: { reactions: 0, comments: 0, reposts: 0 }, previous: { views: 10, searches: 0, posts: 0, reactions: 0, comments: 0, reposts: 0 }, jobs: [],
    ...over,
});
const pro = (over: Partial<UserProfile> = {}) => ({ userType: 'professional', avatar: 'a', title: 'Istruttore', bio: 'b', province: 'MI', publicProfile: true, availableForEmergencies: true, ...over }) as UserProfile;
const pool = (over: Partial<StructureProfile> = {}) => ({ userType: 'structure', logo: 'l', structureType: 'Piscina', bio: 'b', province: 'MI', ...over }) as StructureProfile;

describe('changeOf', () => {
    it('percentuale rispetto al periodo precedente, null senza dati prima', () => {
        expect(changeOf(15, 10)).toBe(50);
        expect(changeOf(5, 10)).toBe(-50);
        expect(changeOf(3, 0)).toBeNull();
    });
});

describe('statsTips', () => {
    it('nessun consiglio per un profilo completo e attivo', () => {
        expect(statsTips(pro(), stats())).toEqual([]);
    });
    it('profilo incompleto prima di tutto, con ciò che manca', () => {
        const [first] = statsTips(pro({ avatar: '', province: '' }), stats());
        expect(first.id).toBe('profilo');
        expect(first.text).toContain('la foto, la provincia');
    });
    it('molte ricerche e poche visite: curare foto e qualifica', () => {
        expect(statsTips(pro(), stats({ searchesLast30: 20, viewsLast30: 2 })).map((t) => t.id)).toContain('impressione');
    });
    it('calo delle visite solo se non c’è già il consiglio di pubblicare', () => {
        expect(statsTips(pro(), stats({ viewsLast30: 3, previous: { ...stats().previous, views: 10 } })).map((t) => t.id)).toEqual(['calo']);
        expect(statsTips(pro(), stats({ viewsLast30: 3, postsLast30: 0, previous: { ...stats().previous, views: 10 } })).map((t) => t.id)).toEqual(['post']);
    });
    it('strutture: annuncio aperto da molti senza candidature e candidature da leggere', () => {
        const jobs = [{ id: 'j1', title: 'Istruttore', isActive: true, isSOS: false, createdAt: '', views: 30, viewers: 25, applications: 0, newApplications: 0 }, { id: 'j2', title: 'Bagnino', isActive: true, isSOS: false, createdAt: '', views: 5, viewers: 5, applications: 2, newApplications: 2 }];
        const ids = statsTips(pool(), stats({ jobs })).map((t) => t.id);
        expect(ids).toEqual(['annuncio-j1', 'candidature']);
        expect(statsTips(pool(), stats({ jobs: [] }))[0].id).toBe('annuncio');
    });
    it('al massimo tre consigli', () => {
        expect(statsTips(pro({ avatar: '', publicProfile: false, availableForEmergencies: false }), stats({ postsLast30: 0, searchesLast30: 30, viewsLast30: 1 }))).toHaveLength(3);
    });
});
