import React from 'react';

/** Barra di caricamento con la percentuale (leggibile anche dagli screen reader). */
export const UploadProgress: React.FC<{ value: number; label?: string; className?: string }> = ({ value, label = 'Caricamento', className = '' }) => (
    <div className={className}>
        <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1">
            <span>{label}</span>
            <span className="tabular-nums text-corsia-700">{value}%</span>
        </div>
        <div className="h-2 rounded-full bg-slate-200 overflow-hidden" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
            <div className="h-full rounded-full bg-linear-to-r from-corsia-600 to-cloro-500 transition-[width] duration-200 ease-out" style={{ width: `${value}%` }} />
        </div>
    </div>
);
