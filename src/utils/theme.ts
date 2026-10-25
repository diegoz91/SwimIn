/**
 * Tema chiaro, scuro o come il dispositivo. La scelta resta in questo browser (localStorage):
 * è una preferenza di visualizzazione, non un dato dell'account. index.html la applica prima
 * del primo disegno della pagina, così non c'è il lampo bianco all'apertura.
 */
export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'swimin-theme';
const COLORS = { light: '#0E6A97', dark: '#08131A' };

export function getThemePref(): ThemePref {
    try {
        const v = localStorage.getItem(KEY);
        return v === 'light' || v === 'dark' ? v : 'system';
    } catch (err) {
        console.warn('Tema non leggibile:', err);
        return 'system';
    }
}

const prefersDark = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;

export const resolveTheme = (pref: ThemePref): 'light' | 'dark' => (pref === 'system' ? (prefersDark() ? 'dark' : 'light') : pref);

export function applyTheme(pref: ThemePref = getThemePref()) {
    const theme = resolveTheme(pref);
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLORS[theme]);
    return theme;
}

export function setThemePref(pref: ThemePref) {
    try {
        if (pref === 'system') localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, pref);
    } catch (err) {
        console.warn('Tema non salvato:', err);
    }
    applyTheme(pref);
    window.dispatchEvent(new CustomEvent('swimin-theme', { detail: pref }));
}

/** Con "come il dispositivo", segue i cambi del sistema (es. modalità scura automatica la sera). */
export function watchSystemTheme() {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return () => undefined;
    const onChange = () => { if (getThemePref() === 'system') applyTheme('system'); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
}
