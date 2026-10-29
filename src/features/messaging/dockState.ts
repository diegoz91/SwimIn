/** Finestre aperte nel widget dei messaggi: restano aperte cambiando pagina e ricaricando (stessa scheda). */
export interface DockWindow { userId: string; minimized: boolean }
export interface DockState { open: boolean; windows: DockWindow[] }

const KEY = 'swimin:chat-dock';
export const EMPTY_DOCK: DockState = { open: false, windows: [] };

/** Quante finestre stanno accanto all'elenco: 2 su un portatile, 3 su uno schermo largo. */
export const maxWindowsFor = (width: number) => (width >= 1680 ? 3 : width >= 1280 ? 2 : 0);

/** Apre (o riporta in primo piano) una conversazione: la più recente sta accanto all'elenco; oltre il massimo si chiude la più vecchia. */
export function openWindow(state: DockState, userId: string, max: number): DockState {
    const rest = state.windows.filter((w) => w.userId !== userId);
    return { ...state, windows: [{ userId, minimized: false }, ...rest].slice(0, Math.max(1, max)) };
}

export const closeWindow = (state: DockState, userId: string): DockState => ({ ...state, windows: state.windows.filter((w) => w.userId !== userId) });
export const toggleWindow = (state: DockState, userId: string): DockState => ({
    ...state,
    windows: state.windows.map((w) => (w.userId === userId ? { ...w, minimized: !w.minimized } : w)),
});

export function readDock(): DockState {
    try {
        const raw = JSON.parse(sessionStorage.getItem(KEY) || 'null') as DockState | null;
        if (!raw || !Array.isArray(raw.windows)) return EMPTY_DOCK;
        return { open: !!raw.open, windows: raw.windows.filter((w) => typeof w?.userId === 'string').slice(0, 3).map((w) => ({ userId: w.userId, minimized: !!w.minimized })) };
    } catch (err) {
        console.warn('Stato del widget dei messaggi non leggibile:', err);
        return EMPTY_DOCK;
    }
}

export function saveDock(state: DockState) {
    try {
        sessionStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
        console.warn('Stato del widget dei messaggi non salvato:', err);
    }
}
