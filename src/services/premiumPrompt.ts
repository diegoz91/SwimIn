/**
 * Invito a passare a Premium, richiesto da qualsiasi punto dell'app (di solito da
 * callApi quando il server risponde 'premium_required'). Lo mostra <PremiumPrompt />.
 */
export interface PremiumRequest { message: string; code: string }

const EVENT = 'swimin:premium-required';
let last: { message: string; at: number } | null = null;

export function requestPremium(message: string, code = 'premium_required') {
    last = { message, at: Date.now() };
    window.dispatchEvent(new CustomEvent<PremiumRequest>(EVENT, { detail: { message, code } }));
}

/** Il messaggio è appena stato mostrato nell'invito: non serve ripeterlo in un avviso. */
export const isRecentPremiumMessage = (message: string) => !!last && last.message === message && Date.now() - last.at < 3000;

export function onPremiumRequest(handler: (req: PremiumRequest) => void) {
    const listener = (e: Event) => handler((e as CustomEvent<PremiumRequest>).detail);
    window.addEventListener(EVENT, listener);
    return () => window.removeEventListener(EVENT, listener);
}
