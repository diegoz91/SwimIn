import type { Job } from '@/types/types';

/** Titolo dell'annuncio senza il vecchio prefisso "🚨 SOS SOSTITUZIONE URGENTE:". */
export function jobDisplayTitle(job?: Pick<Job, 'title'> | null): string {
    if (!job?.title) return '';
    return job.title.replace(/^🚨\s*SOS SOSTITUZIONE URGENTE:\s*/i, '').replace(/^Sostituzione urgente:\s*/i, '');
}

/** L'annuncio è attivo e non ancora scaduto (la data di scadenza è inclusa). */
export function isJobOpen(job: Pick<Job, 'isActive' | 'expiresAt'>, today: string = new Date().toISOString().slice(0, 10)): boolean {
    return job.isActive !== false && (!job.expiresAt || job.expiresAt >= today);
}

/** "Scade tra 3 giorni", "Scade oggi", "Scaduto" oppure ''. */
export function jobExpiryLabel(job: Pick<Job, 'expiresAt'>, now: Date = new Date()): string {
    if (!job.expiresAt) return '';
    const [y, m, d] = job.expiresAt.split('-').map(Number);
    const days = Math.round((new Date(y, m - 1, d).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000);
    if (days < 0) return 'Scaduto';
    if (days === 0) return 'Scade oggi';
    if (days === 1) return 'Scade domani';
    return days <= 7 ? `Scade tra ${days} giorni` : '';
}
