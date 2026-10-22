/**
 * Avatar con le iniziali, generato localmente come SVG (data URI).
 * Sostituisce il servizio esterno ui-avatars.com: nessun nome inviato a terzi,
 * nessuna richiesta di rete e colori coerenti con il brand SwimIn.
 */

/** Coppie sfondo/testo della palette SwimIn, scelte in modo stabile dal nome. */
const TONES: [string, string][] = [
    ['#D5ECF6', '#0C567B'], // corsia
    ['#CFF3F0', '#0B6F6A'], // cloro
    ['#DCE7EE', '#0A2738'], // abisso
    ['#E3F1E7', '#1F6B3A'], // vasca esterna
    ['#FCE8D9', '#8A4512'], // blocchi di partenza
    ['#E9E4F7', '#4B3A8C'], // corsia artistico
];

const hash = (s: string) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
};

/** "Mario Rossi" -> "MR", "Piscina Comunale di Segrate" -> "PC", "" -> "?" */
export function initialsOf(name?: string | null): string {
    const words = (name || '')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 0 && !/^(di|da|del|della|dei|e|la|il|lo|le|gli|a)$/i.test(w));
    if (words.length === 0) return '?';
    const first = words[0][0];
    const second = words.length > 1 ? words[1][0] : words[0][1] || '';
    return (first + second).toUpperCase();
}

export function initialsAvatar(name?: string | null): string {
    const label = initialsOf(name);
    const [bg, fg] = TONES[hash(name || '?') % TONES.length];
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
        `<rect width="64" height="64" fill="${bg}"/>` +
        `<text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="Figtree,system-ui,sans-serif" ` +
        `font-size="26" font-weight="700" fill="${fg}">${label.replace(/[<&>]/g, '')}</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
