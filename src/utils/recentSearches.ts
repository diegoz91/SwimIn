/** Ricerche recenti, salvate solo in questo browser (intestazione e pagina Cerca). */
const RECENT_KEY = 'swimin-recent-searches';
const MAX = 6;

export function readRecentSearches(): string[] {
    try {
        const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
        return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, MAX) : [];
    } catch (err) {
        console.warn('Ricerche recenti non leggibili:', err);
        return [];
    }
}

export function saveRecentSearch(q: string) {
    const term = q.trim();
    if (term.length < 2) return;
    try {
        const next = [term, ...readRecentSearches().filter((x) => x.toLowerCase() !== term.toLowerCase())].slice(0, MAX);
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch (err) {
        console.warn('Ricerca recente non salvata:', err);
    }
}

export function clearRecentSearches() {
    try {
        localStorage.removeItem(RECENT_KEY);
    } catch (err) {
        console.warn('Ricerche recenti non cancellate:', err);
    }
}
