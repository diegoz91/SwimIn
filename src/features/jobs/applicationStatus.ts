import type { Application } from '@/types/types';
import type { IconType } from '@/components/ui/Icon';

export type ApplicationStatus = Application['status'];

/**
 * Fasi di una candidatura, con i nomi visti dalla struttura e da chi si candida.
 * pending = nuova (non ancora aperta), reviewed = vista, accepted = selezionata per un colloquio.
 */
export const STATUS: Record<ApplicationStatus, { manager: string; candidate: string; icon: IconType; tone: string }> = {
    pending: { manager: 'Nuova', candidate: 'Inviata', icon: 'send', tone: 'bg-corsia-50 text-corsia-800 border-corsia-200' },
    reviewed: { manager: 'Vista', candidate: 'Vista dalla struttura', icon: 'eye', tone: 'bg-slate-100 text-slate-700 border-slate-200' },
    accepted: { manager: 'Selezionata', candidate: 'Selezionata per un colloquio', icon: 'check-circle', tone: 'bg-cloro-50 text-cloro-800 border-cloro-200' },
    hired: { manager: 'Assunta', candidate: 'Assunta', icon: 'sparkles', tone: 'bg-cloro-100 text-cloro-800 border-cloro-300' },
    rejected: { manager: 'Scartata', candidate: 'Non selezionata', icon: 'x', tone: 'bg-slate-100 text-slate-600 border-slate-200' },
};

/** Gruppi della lista candidati per la struttura, nell'ordine in cui si lavorano. */
export const PIPELINE: { id: 'nuove' | 'valutazione' | 'selezionate' | 'assunte' | 'scartate'; label: string; statuses: ApplicationStatus[] }[] = [
    { id: 'nuove', label: 'Nuove', statuses: ['pending'] },
    { id: 'valutazione', label: 'Viste', statuses: ['reviewed'] },
    { id: 'selezionate', label: 'Selezionate', statuses: ['accepted'] },
    { id: 'assunte', label: 'Assunte', statuses: ['hired'] },
    { id: 'scartate', label: 'Scartate', statuses: ['rejected'] },
];
export type PipelineId = (typeof PIPELINE)[number]['id'];

/** Tappe mostrate a chi si candida: fatte, in corso, da fare. */
export function candidateSteps(status: ApplicationStatus): { label: string; state: 'done' | 'current' | 'todo' | 'stopped' }[] {
    const order: ApplicationStatus[] = ['pending', 'reviewed', 'accepted', 'hired'];
    if (status === 'rejected') {
        return [
            { label: 'Inviata', state: 'done' },
            { label: 'Vista dalla struttura', state: 'done' },
            { label: 'Non selezionata', state: 'stopped' },
        ];
    }
    const at = order.indexOf(status);
    const labels = ['Inviata', 'Vista dalla struttura', 'Selezionata per un colloquio', 'Assunta'];
    return labels.map((label, i) => ({ label, state: i < at ? 'done' : i === at ? (status === 'hired' ? 'done' : 'current') : 'todo' }));
}

/** Frase che spiega a chi si candida cosa succede adesso. */
export const candidateHint: Record<ApplicationStatus, string> = {
    pending: 'La struttura non ha ancora aperto la tua candidatura. Ti avvisiamo appena cambia qualcosa.',
    reviewed: 'La struttura ha visto la tua candidatura e la sta valutando.',
    accepted: 'Sei tra le persone selezionate: la struttura potrebbe scriverti o chiamarti per un colloquio.',
    hired: 'Fai parte dello staff: trovi bacheca, turni e chat nell’area staff della struttura.',
    rejected: 'Questa volta la struttura ha scelto un altro profilo. Attiva un avviso per le prossime offerte simili.',
};
