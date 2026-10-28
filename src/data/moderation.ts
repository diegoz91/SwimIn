/**
 * Regole per motivare rimozioni e sospensioni (Digital Services Act art. 17).
 * Allineate a `MODERATION_GROUNDS` in functions/api/src/moderation.js (le chiavi sono anche i motivi delle segnalazioni).
 */
export const MODERATION_GROUNDS = {
    spam: 'Spam o pubblicità non richiesta',
    molestie: 'Molestie, insulti o minacce',
    contenuto_inappropriato: 'Contenuto inappropriato o illegale',
    falso_profilo: 'Profilo falso o che si spaccia per un altro',
    offerta_ingannevole: 'Offerta di lavoro ingannevole',
    dati_altrui: 'Dati personali di altre persone senza consenso',
    altro: 'Altra violazione dei Termini di servizio',
} as const;
export type ModerationGround = keyof typeof MODERATION_GROUNDS;
export const groundOf = (reason?: string | null): ModerationGround => (reason && reason in MODERATION_GROUNDS ? (reason as ModerationGround) : 'altro');
