import type { Facility, StructureProfile, UserProfile } from '@/types/types';

type AnyProfile = Partial<UserProfile> | Partial<StructureProfile> | Partial<Facility> | null | undefined;

/** Premium attivo: premiumUntil nel futuro (lo scrive solo il server). */
export function isPremium(p: AnyProfile, now: number = Date.now()): boolean {
    const until = p && 'premiumUntil' in p ? (p as { premiumUntil?: string | null }).premiumUntil : null;
    return !!until && new Date(until).getTime() > now;
}

/** Prezzo in euro alla maniera italiana: 4,99 € */
export const euro = (cents: number) => `${(cents / 100).toLocaleString('it-IT', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })} €`;

export type Audience = 'person' | 'enthusiast' | 'structure';

export const AUDIENCE_LABEL: Record<Audience, string> = { person: 'Professionisti', enthusiast: 'Appassionati', structure: 'Strutture' };
export const PLAN_NAME: Record<Audience, string> = { person: 'Premium', enthusiast: 'Premium Passione', structure: 'Premium Strutture' };

/**
 * Confronto Base / Premium per ogni tipo di profilo. I limiti sono verificati dalla Function
 * (billing.js: BASE_ACTIVE_JOBS, BASE_STAFF, BASE_ALERTS, INMAIL_CREDITS): tenerli allineati.
 */
export const PLAN_FEATURES: Record<Audience, { label: string; base: string | boolean; premium: string | boolean }[]> = {
    person: [
        { label: 'Profilo, rete, feed, candidature e messaggi ai collegamenti', base: true, premium: true },
        { label: 'Avvisi SOS di sostituzione nella tua provincia', base: true, premium: true },
        { label: 'Avvisi di lavoro salvati', base: 'Fino a 2', premium: 'Fino a 10' },
        { label: 'Candidature in cima alla lista della struttura', base: false, premium: true },
        { label: 'Più in alto quando le strutture cercano personale', base: false, premium: true },
        { label: 'Chi ha visto il tuo profilo', base: 'Ultimi 3', premium: 'Tutti, 30 giorni' },
        { label: 'Statistiche di profilo e post', base: false, premium: true },
        { label: 'Messaggi diretti a chi non è un collegamento', base: false, premium: '15 al mese' },
        { label: 'Visite anonime ai profili Base', base: false, premium: true },
        { label: 'Badge Premium sul profilo', base: false, premium: true },
    ],
    enthusiast: [
        { label: 'Profilo, rete, feed, gruppi ed eventi', base: true, premium: true },
        { label: 'Precedenza nelle liste d’attesa degli eventi', base: false, premium: true },
        { label: 'Chi ha visto il tuo profilo', base: 'Ultimi 3', premium: 'Tutti, 30 giorni' },
        { label: 'Statistiche di profilo e post', base: false, premium: true },
        { label: 'Messaggi diretti a chi non è un collegamento', base: false, premium: '5 al mese' },
        { label: 'Visite anonime ai profili Base', base: false, premium: true },
        { label: 'Badge Premium sul profilo', base: false, premium: true },
    ],
    structure: [
        { label: 'Pagina struttura, recensioni e SOS nella tua provincia', base: true, premium: true },
        { label: 'Annunci di lavoro attivi', base: 'Fino a 2', premium: 'Senza limiti' },
        { label: 'Annunci in evidenza nella bacheca', base: false, premium: true },
        { label: 'SOS anche nelle altre province della regione', base: false, premium: true },
        { label: 'Area staff: bacheca, turni e chat', base: 'Fino a 5 persone', premium: 'Squadra senza limiti' },
        { label: 'Ricerca personale avanzata (disponibilità, verificati, sostituzioni)', base: false, premium: true },
        { label: 'Messaggi diretti ai professionisti', base: false, premium: '40 al mese' },
        { label: 'Chi ha visto la pagina e statistiche', base: 'Ultimi 3', premium: 'Tutti, con statistiche' },
        { label: 'Badge Premium sulla pagina', base: false, premium: true },
    ],
};
