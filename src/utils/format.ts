/** Formattazioni condivise per date e numeri, in italiano. */

const rtf = new Intl.RelativeTimeFormat('it', { numeric: 'auto' });

/** "ora", "5 min fa", "3 h fa", "ieri", "4 gg fa", poi data breve. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
    const date = new Date(iso);
    const diffSec = Math.round((date.getTime() - now.getTime()) / 1000);
    const abs = Math.abs(diffSec);

    if (abs < 60) return 'ora';
    if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
    if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
    if (abs < 7 * 86400) return rtf.format(Math.round(diffSec / 86400), 'day');

    const sameYear = date.getFullYear() === now.getFullYear();
    return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** 1200 -> "1.200", 15300 -> "15,3K". */
export function formatCount(n: number): string {
    if (n < 10_000) return n.toLocaleString('it-IT');
    return new Intl.NumberFormat('it-IT', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}
