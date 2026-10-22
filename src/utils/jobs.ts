import type { Job } from '@/types/types';

/** Titolo dell'annuncio senza il vecchio prefisso "🚨 SOS SOSTITUZIONE URGENTE:". */
export function jobDisplayTitle(job?: Pick<Job, 'title'> | null): string {
    if (!job?.title) return '';
    return job.title.replace(/^🚨\s*SOS SOSTITUZIONE URGENTE:\s*/i, '').replace(/^Sostituzione urgente:\s*/i, '');
}
