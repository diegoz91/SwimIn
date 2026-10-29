import type { NavigateFunction } from 'react-router';

/** Evento che apre una conversazione nel widget dei messaggi (finestra in basso, come su LinkedIn). */
export const OPEN_CHAT_EVENT = 'swimin:open-chat';
/** Il widget c'è da questa larghezza (classe `xl`). */
export const DOCK_MIN_WIDTH = 1280;

const dockAvailable = () =>
    typeof window !== 'undefined' && window.matchMedia?.(`(min-width: ${DOCK_MIN_WIDTH}px)`).matches && !!document.querySelector('[data-chat-dock]');

/**
 * "Scrivi" / "Messaggio" da qualsiasi pagina: su computer apre la finestra della chat senza
 * lasciare la pagina; su tablet e smartphone apre la pagina Messaggi.
 */
export function openChat(userId: string, navigate: NavigateFunction) {
    if (dockAvailable()) window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT, { detail: userId }));
    else navigate('/messages', { state: { startChatWithUserId: userId } });
}
