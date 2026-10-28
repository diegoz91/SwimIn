import React from 'react';
import { Icon } from '@/components/ui/Icon';

/**
 * Avviso sui dati da non inserire nel CV e nelle candidature (GDPR art. 9 e 10): salute,
 * categorie protette, documenti, dati di terzi. Non servono per candidarsi e la struttura che li
 * riceverebbe non ha una base per trattarli.
 */
export const SensitiveDataNotice: React.FC<{ className?: string }> = ({ className = '' }) => (
    <div className={`flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 ${className}`} role="note">
        <Icon type="shield" className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
        <p>
            <strong className="font-semibold">Prima di caricarlo togli i dati che non servono:</strong> salute o invalidità, appartenenza a categorie protette,
            convinzioni religiose o politiche, condanne, foto di documenti, codice fiscale, IBAN e dati di altre persone. Se vuoi
            parlarne con una struttura, fallo direttamente con lei dopo il primo contatto.
        </p>
    </div>
);
