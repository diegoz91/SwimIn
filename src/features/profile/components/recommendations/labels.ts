import type { RecommendationRelationship } from '@/services/database';

export const RELATIONSHIPS: { value: RecommendationRelationship; label: string }[] = [
    { value: 'collega', label: 'Abbiamo lavorato insieme' },
    { value: 'responsabile', label: 'Ero il suo responsabile' },
    { value: 'collaboratore', label: 'Era il mio responsabile' },
    { value: 'allievo', label: 'Mi ha allenato o insegnato' },
    { value: 'altro', label: 'Altro' },
];

export const relationLabel = (r: RecommendationRelationship) =>
    ({ collega: 'Collega', responsabile: 'Suo responsabile', collaboratore: 'Collaboratore', allievo: 'Allievo', struttura: 'Struttura in cui ha lavorato', altro: 'Conoscenza professionale' })[r] || '';
