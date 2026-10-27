import React from 'react';

/** Interruttore acceso/spento (role="switch"): per le preferenze che si salvano subito. */
export const Switch: React.FC<{
    checked: boolean;
    onChange: (checked: boolean) => void;
    /** Nome per gli screen reader (di solito il titolo della riga). */
    label: string;
    disabled?: boolean;
    id?: string;
    describedBy?: string;
}> = ({ checked, onChange, label, disabled, id, describedBy }) => (
    <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        aria-describedby={describedBy}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors duration-150 outline-none focus-visible:ring-4 focus-visible:ring-corsia-100 disabled:opacity-50 disabled:cursor-not-allowed ${
            checked ? 'bg-corsia-600' : 'bg-slate-300 hover:bg-slate-400'
        }`}
    >
        <span
            aria-hidden="true"
            className={`inline-block h-5 w-5 rounded-full bg-white shadow-xs transition-transform duration-150 ${checked ? 'translate-x-6' : 'translate-x-1'}`}
        />
    </button>
);
