import React from 'react';

/**
 * Caricamento: un nuotatore percorre la corsia avanti e indietro sopra il galleggiante.
 * Con "riduci movimento" resta fermo (regola globale in globals.css).
 */
export const PageLoader: React.FC<{ label?: string }> = ({ label = 'Caricamento…' }) => (
    <div className="flex-1 flex items-center justify-center py-24" role="status" aria-live="polite">
        <div className="flex flex-col items-center gap-4">
            <div className="relative w-40 h-6" aria-hidden="true">
                <span className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-px bg-corsia-100" />
                <span className="absolute top-1/2 -translate-y-1/2 h-3 w-10 animate-lap">
                    <span className="absolute inset-y-0 right-0 w-3 rounded-full bg-corsia-600" />
                    <span className="absolute top-1/2 -translate-y-1/2 right-2 w-8 h-1.5 rounded-full bg-gradient-to-l from-cloro-400 to-transparent animate-wake" />
                </span>
            </div>
            <div className="lane-rope w-40 rounded-full opacity-80" aria-hidden="true" />
            <span className="text-sm font-medium text-slate-500">{label}</span>
        </div>
    </div>
);
