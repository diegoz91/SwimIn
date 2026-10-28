import type { StructureProfile, UserProfile } from '@/types/types';
import { parseCertifications } from '@/utils/certifications';

type Profile = UserProfile | StructureProfile;
export interface RankedSuggestion { profile: Profile; score: number; reason: string }

const idOf = (p: Profile) => p.userId || p.$id;
const norm = (s?: string | null) => (s || '').trim().toLowerCase();
const certNames = (p: Profile) =>
    p.userType === 'professional' ? new Set(parseCertifications((p as UserProfile).certificationsList).map((c) => norm(c.name)).filter(Boolean)) : new Set<string>();

/**
 * Suggerimenti più affini al profilo: collegamenti in comune, stessa provincia o città, stesso ruolo,
 * brevetti in comune; per chi lavora in vasca le strutture vicine, per le strutture i professionisti vicini.
 * A parità di punteggio restano nell'ordine ricevuto (i profili più recenti prima). Il motivo è il più forte.
 */
export function rankSuggestions(me: Profile, candidates: Profile[]): RankedSuggestion[] {
    const mine = new Set(me.connections || []);
    const myCerts = certNames(me);
    const myRole = me.userType === 'professional' ? norm((me as UserProfile).title) : '';
    return candidates
        .filter((p) => idOf(p) !== idOf(me) && !mine.has(idOf(p)) && !p.suspended)
        .map((p, index) => {
            const reasons: { points: number; text: string }[] = [];
            const mutual = (p.connections || []).filter((id) => mine.has(id)).length;
            if (mutual) reasons.push({ points: mutual * 3, text: mutual === 1 ? '1 collegamento in comune' : `${mutual} collegamenti in comune` });
            const sameProvince = !!me.province && norm(me.province) === norm(p.province);
            if (sameProvince) reasons.push({ points: 2, text: p.city && norm(p.city) === norm(me.city) ? `Anche a ${p.city}` : 'Nella tua provincia' });
            else if (me.city && norm(me.city) === norm(p.city)) reasons.push({ points: 2, text: `Anche a ${p.city}` });
            if (myRole && p.userType === 'professional' && norm((p as UserProfile).title) === myRole) reasons.push({ points: 1, text: 'Stesso ruolo' });
            const shared = [...certNames(p)].filter((c) => myCerts.has(c)).length;
            if (shared) reasons.push({ points: shared, text: shared === 1 ? '1 brevetto in comune' : `${shared} brevetti in comune` });
            // Chi cerca lavoro e chi cerca personale nella stessa zona.
            if (sameProvince && me.userType !== p.userType) reasons.push({ points: 1, text: p.userType === 'structure' ? 'Struttura nella tua provincia' : 'Professionista nella tua provincia' });
            const score = reasons.reduce((n, r) => n + r.points, 0);
            const best = reasons.sort((a, b) => b.points - a.points)[0];
            return { profile: p, score, reason: best?.text || '', index };
        })
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map(({ profile, score, reason }) => ({ profile, score, reason }));
}
