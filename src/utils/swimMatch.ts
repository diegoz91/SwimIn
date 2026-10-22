import type { Job, UserProfile } from '@/types/types';

/** Parole che non aiutano a capire se un requisito è soddisfatto. */
const STOP_WORDS = new Set([
    'brevetto', 'brevetti', 'corso', 'livello', 'della', 'delle', 'degli', 'dello', 'nella', 'per', 'con', 'una', 'uno',
    'dei', 'del', 'gli', 'le', 'il', 'lo', 'la', 'di', 'da', 'in', 'e', 'o', 'a', 'requisito', 'obbligatorio', 'preferibile',
]);

const normalize = (s: string) =>
    s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ');

const keywords = (s: string) => normalize(s).split(/\s+/).filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

/** Sinonimi frequenti nel settore: un brevetto SNS è un brevetto di salvamento, ecc. */
const SYNONYMS: Record<string, string[]> = {
    salvamento: ['bagnanti', 'bagnino', 'sns', 'assistente'],
    bagnino: ['salvamento', 'bagnanti', 'assistente'],
    istruttore: ['istruttrice', 'insegnante', 'allenatore', 'allenatrice'],
    fin: ['federazione', 'federnuoto'],
    blsd: ['bls', 'defibrillatore', 'soccorso'],
    soccorso: ['blsd', 'bls'],
};

const parseList = (list: string[] | undefined, fields: string[]) =>
    (list || []).map((raw) => {
        try {
            const obj = JSON.parse(raw) as Record<string, string>;
            return fields.map((f) => obj[f] || '').join(' ');
        } catch {
            return raw;
        }
    });

/**
 * Percentuale di requisiti dell'annuncio soddisfatti dal profilo, confrontando
 * le parole chiave con brevetti, esperienze, competenze e qualifica.
 * Restituisce null se l'annuncio non ha requisiti.
 */
export function swimMatchScore(user: Pick<UserProfile, 'certificationsList' | 'experienceList' | 'skills' | 'title'>, job: Pick<Job, 'requirements' | 'qualificationsRequired'>): number | null {
    const requirements = [...(job.requirements || []), ...(job.qualificationsRequired || [])].filter((r) => r.trim());
    if (requirements.length === 0) return null;

    const corpus = new Set(
        keywords(
            [
                ...parseList(user.certificationsList, ['name', 'issuer', 'category']),
                ...parseList(user.experienceList, ['role', 'facility', 'description']),
                ...(user.skills || []),
                user.title || '',
            ].join(' ')
        )
    );
    const has = (w: string) => corpus.has(w) || (SYNONYMS[w] || []).some((s) => corpus.has(s));

    let met = 0;
    for (const req of requirements) {
        const words = keywords(req);
        if (words.length === 0) continue;
        if (/esperienz/i.test(req) && (user.experienceList || []).length > 0) {
            met++;
            continue;
        }
        const found = words.filter(has).length;
        if (found / words.length >= 0.5) met++;
    }
    return Math.round((met / requirements.length) * 100);
}
