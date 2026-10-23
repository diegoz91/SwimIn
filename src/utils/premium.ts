import type { Facility, StructureProfile, UserProfile } from '@/types/types';

type AnyProfile = Partial<UserProfile> | Partial<StructureProfile> | Partial<Facility> | null | undefined;

/** Premium attivo: premiumUntil nel futuro (lo scrive solo il server). */
export function isPremium(p: AnyProfile, now: number = Date.now()): boolean {
    const until = p && 'premiumUntil' in p ? (p as { premiumUntil?: string | null }).premiumUntil : null;
    return !!until && new Date(until).getTime() > now;
}

/** Prezzo in euro alla maniera italiana: 4,99 € */
export const euro = (cents: number) => `${(cents / 100).toLocaleString('it-IT', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })} €`;

export type Audience = 'person' | 'structure';

/** Confronto Base / Premium, per persone e strutture. */
export const PLAN_FEATURES: Record<Audience, { label: string; base: string | boolean; premium: string | boolean }[]> = {
    person: [
        { label: 'Profilo, rete, feed, messaggi ai collegamenti', base: true, premium: true },
        { label: 'Chi ha visto il tuo profilo', base: 'Ultimi 3', premium: 'Tutti, 30 giorni' },
        { label: 'Statistiche di profilo e post', base: false, premium: true },
        { label: 'Messaggi diretti a chi non è un collegamento', base: false, premium: '15 al mese' },
        { label: 'Candidature in cima alla lista della struttura', base: false, premium: true },
        { label: 'Visite anonime ai profili Base', base: false, premium: true },
        { label: 'Badge Premium sul profilo', base: false, premium: true },
        { label: 'Ricerca avanzata (disponibilità, brevetti verificati)', base: false, premium: true },
    ],
    structure: [
        { label: 'Pagina struttura, recensioni, area staff', base: true, premium: true },
        { label: 'Annunci di lavoro attivi', base: 'Fino a 3', premium: 'Senza limiti' },
        { label: 'Annunci in evidenza nella bacheca', base: false, premium: true },
        { label: 'Ricerca personale avanzata (disponibilità, verificati, sostituzioni)', base: false, premium: true },
        { label: 'Messaggi diretti ai professionisti', base: false, premium: '40 al mese' },
        { label: 'Chi ha visto la pagina e statistiche', base: 'Ultimi 3', premium: 'Tutti, con statistiche' },
        { label: 'Badge Premium sulla pagina', base: false, premium: true },
    ],
};
