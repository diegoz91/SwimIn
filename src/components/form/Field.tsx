import React from 'react';
import { Icon } from '@/components/ui/Icon';

/** Classi comuni per input, select e textarea, con stato d'errore. */
export const fieldClass = (error?: string, extra = '') =>
    `w-full px-4 py-3 rounded-xl border bg-white text-abisso placeholder:text-slate-400 outline-hidden transition-[border-color,box-shadow] duration-150 focus:ring-4 disabled:opacity-60 disabled:bg-slate-50 ${
        error ? 'border-galleggiante focus:ring-red-100' : 'border-slate-200 hover:border-slate-300 focus:border-corsia-400 focus:ring-corsia-100'
    } ${extra}`;

interface FieldProps {
    id: string;
    label: React.ReactNode;
    /** Mostra "facoltativo" accanto all'etichetta. */
    optional?: boolean;
    hint?: React.ReactNode;
    error?: string;
    /** Contatore di caratteri: mostrato quando ci si avvicina al limite. */
    count?: { value: string; max: number };
    className?: string;
    /** Elemento dentro il campo, a destra (es. "Mostra" per la password). */
    trailing?: React.ReactNode;
    /** Un solo elemento di input: riceve id e attributi ARIA. */
    children: React.ReactElement<Record<string, unknown>>;
}

/** Etichetta, campo, suggerimento ed errore collegati per gli screen reader. */
export const Field: React.FC<FieldProps> = ({ id, label, optional, hint, error, count, className = '', trailing, children }) => {
    const hintId = hint ? `${id}-hint` : undefined;
    const errorId = error ? `${id}-error` : undefined;
    const length = count ? count.value.trim().length : 0;
    const showCount = count && length > count.max * 0.7;
    const child = React.cloneElement(children, {
        id,
        'aria-invalid': error ? 'true' : undefined,
        'aria-describedby': [errorId, hintId].filter(Boolean).join(' ') || undefined,
        className: (children.props.className as string | undefined) ?? fieldClass(error),
    });

    return (
        <div className={className}>
            <div className="flex items-baseline justify-between gap-3 mb-1.5">
                <label htmlFor={id} className="text-sm font-semibold text-abisso">
                    {label}
                    {optional && <span className="ml-1.5 font-normal text-slate-400">facoltativo</span>}
                </label>
                {showCount && (
                    <span className={`text-xs tabular-nums ${length > count.max ? 'text-galleggiante-700 font-semibold' : 'text-slate-400'}`} aria-live="polite">
                        {length}/{count.max}
                    </span>
                )}
            </div>
            {trailing ? (
                <div className="relative">
                    {child}
                    <div className="absolute inset-y-0 right-2 flex items-center">{trailing}</div>
                </div>
            ) : (
                child
            )}
            {error ? (
                <p id={errorId} className="mt-1.5 text-sm text-galleggiante-700 flex items-start gap-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                    <Icon type="alert-triangle" className="w-4 h-4 mt-0.5 shrink-0" />
                    {error}
                </p>
            ) : (
                hint && (
                    <p id={hintId} className="mt-1.5 text-xs text-slate-500">
                        {hint}
                    </p>
                )
            )}
        </div>
    );
};

/** Casella di controllo del sito, con etichetta cliccabile. */
export const Checkbox: React.FC<{ id: string; checked: boolean; onChange: (checked: boolean) => void; label: React.ReactNode; description?: React.ReactNode; disabled?: boolean; invalid?: boolean; tone?: 'default' | 'danger' }> = ({
    id, checked, onChange, label, description, disabled, invalid, tone = 'default',
}) => {
    const on = tone === 'danger' ? 'bg-galleggiante border-galleggiante' : 'bg-corsia-600 border-corsia-600';
    return (
        <label htmlFor={id} className={`group flex items-start gap-3 ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
            <input
                id={id}
                type="checkbox"
                checked={checked}
                disabled={disabled}
                aria-invalid={invalid ? 'true' : undefined}
                onChange={(e) => onChange(e.target.checked)}
                className="peer sr-only"
            />
            <span
                aria-hidden="true"
                className={`mt-0.5 w-5 h-5 shrink-0 rounded-md border-2 grid place-items-center transition-colors duration-150 peer-focus-visible:ring-4 peer-focus-visible:ring-corsia-100 ${
                    checked ? on : invalid ? 'border-galleggiante bg-white' : 'border-slate-300 bg-white group-hover:border-corsia-400'
                }`}
            >
                <svg viewBox="0 0 16 16" className={`w-3.5 h-3.5 text-white transition-transform duration-150 ${checked ? 'scale-100' : 'scale-0'}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3.5 8.5l3 3 6-7" />
                </svg>
            </span>
            <span className="min-w-0">
                <span className="block text-sm font-semibold text-abisso">{label}</span>
                {description && <span className="block text-xs text-slate-500 mt-0.5">{description}</span>}
            </span>
        </label>
    );
};

/** Gruppo di scelte a pillola (selezione singola o multipla). */
export function ChoiceChips<T extends string>({
    options, value, onChange, multiple = false, label, max,
}: {
    options: { value: T; label: string }[];
    value: T[];
    onChange: (next: T[]) => void;
    multiple?: boolean;
    label: string;
    max?: number;
}) {
    const toggle = (v: T) => {
        if (!multiple) return onChange([v]);
        if (value.includes(v)) return onChange(value.filter((x) => x !== v));
        if (max && value.length >= max) return;
        onChange([...value, v]);
    };
    return (
        <div role="group" aria-label={label} className="flex flex-wrap gap-2">
            {options.map((o) => {
                const on = value.includes(o.value);
                return (
                    <button
                        key={o.value}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggle(o.value)}
                        className={`px-3.5 py-2 rounded-full text-sm font-semibold border transition-colors outline-hidden focus-visible:ring-4 focus-visible:ring-corsia-100 ${
                            on ? 'bg-corsia-600 border-corsia-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                    >
                        {on && <Icon type="check" className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />}
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}
