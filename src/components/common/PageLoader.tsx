import React from 'react';

/** Indicatore mostrato mentre si carica il codice di una pagina. */
export const PageLoader: React.FC<{ label?: string }> = ({ label = 'Caricamento…' }) => (
    <div className="flex-1 flex items-center justify-center py-24" role="status" aria-live="polite">
        <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <span className="text-sm font-medium text-slate-500">{label}</span>
        </div>
    </div>
);
