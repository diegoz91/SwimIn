/**
 * Sezione Rete: collegamenti, gruppi ed eventi sono schede della stessa pagina (/network?tab=…).
 * Unica fonte per i link: i vecchi /gruppi e /eventi reindirizzano qui.
 */
export const NETWORK_TABS = ['collegamenti', 'gruppi', 'eventi'] as const;
export type NetworkTab = (typeof NETWORK_TABS)[number];

export const networkPath = (tab: NetworkTab = 'collegamenti') => (tab === 'collegamenti' ? '/network' : `/network?tab=${tab}`);
export const GROUPS_PATH = networkPath('gruppi');
export const EVENTS_PATH = networkPath('eventi');

/** Scheda dall'indirizzo: valori sconosciuti o mancanti tornano ai collegamenti. */
export const networkTabOf = (value: string | null | undefined): NetworkTab =>
    (NETWORK_TABS as readonly string[]).includes(value || '') ? (value as NetworkTab) : 'collegamenti';
