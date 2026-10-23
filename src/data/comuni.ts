import { useEffect, useState } from 'react';
import { normalizeText } from '@/utils/text';

/**
 * Comuni italiani (fonte ISTAT), un file per provincia in /data/comuni/<SIGLA>.json.
 * Si scaricano solo quando servono e restano in memoria per tutta la sessione.
 */
const byProvince = new Map<string, Promise<string[]>>();
let allPromise: Promise<[string, string][]> | null = null;

const fetchJson = async <T,>(url: string): Promise<T> => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
};

export function loadComuni(province: string): Promise<string[]> {
    const code = province.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) return Promise.resolve([]);
    if (!byProvince.has(code)) {
        const p = fetchJson<string[]>(`/data/comuni/${code}.json`).catch((e) => {
            byProvince.delete(code); // si riprova alla prossima richiesta
            throw e;
        });
        byProvince.set(code, p);
    }
    return byProvince.get(code)!;
}

/** Tutti i comuni come [nome, sigla], per la ricerca senza provincia. */
export function loadAllComuni(): Promise<[string, string][]> {
    if (!allPromise) {
        allPromise = fetchJson<[string, string][]>('/data/comuni/tutti.json').catch((e) => {
            allPromise = null;
            throw e;
        });
    }
    return allPromise;
}

export type ComuniState = { comuni: string[]; loading: boolean; error: boolean };

/** Comuni della provincia indicata (vuoto finché non è scelta). */
export function useComuni(province?: string): ComuniState {
    const [state, setState] = useState<ComuniState>({ comuni: [], loading: false, error: false });
    useEffect(() => {
        if (!province) {
            setState({ comuni: [], loading: false, error: false });
            return;
        }
        let cancelled = false;
        setState((s) => ({ ...s, loading: true, error: false }));
        loadComuni(province)
            .then((comuni) => !cancelled && setState({ comuni, loading: false, error: false }))
            .catch((e) => {
                console.warn('Comuni non disponibili:', e);
                if (!cancelled) setState({ comuni: [], loading: false, error: true });
            });
        return () => {
            cancelled = true;
        };
    }, [province]);
    return state;
}

/** Nome ufficiale del comune se `name` corrisponde (ignorando maiuscole e accenti). */
export function matchComune(name: string, comuni: string[]): string | undefined {
    const n = normalizeText(name);
    if (!n) return undefined;
    return comuni.find((c) => normalizeText(c) === n);
}

/**
 * Per i form: tiene aggiornato l'elenco dei comuni della provincia scelta,
 * così la validazione può controllare che la città le appartenga.
 */
export function useComuniSync(province: string | undefined, onLoaded: (comuni: string[]) => void) {
    const { comuni } = useComuni(province);
    useEffect(() => onLoaded(comuni), [comuni]); // eslint-disable-line react-hooks/exhaustive-deps
}
