import React from 'react';
import { Icon } from '@/components/ui/Icon';

/** Classi comuni per input, select e textarea, con stato d'errore. */
export const fieldClass = (error?: string, extra = '') =>
    `w-full px-4 py-3 rounded-xl border bg-white text-abisso placeholder:text-slate-400 outline-none transition-[border-color,box-shadow] duration-150 focus:ring-4 disabled:opacity-60 disabled:bg-slate-50 ${
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
                    <span className={`text-xs tabular-nums ${length > count.max ? 'text-galleggiante font-semibold' : 'text-slate-400'}`} aria-live="polite">
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
                <p id={errorId} className="mt-1.5 text-sm text-galleggiante flex items-start gap-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                    <Icon type="alert-triangle" className="w-4 h-4 mt-0.5 flex-shrink-0" />
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

/** Casella di controllo con etichetta cliccabile. */
export const Checkbox: React.FC<{ id: string; checked: boolean; onChange: (checked: boolean) => void; label: React.ReactNode; description?: React.ReactNode; disabled?: boolean }> = ({
    id, checked, onChange, label, description, disabled,
}) => (
    <label htmlFor={id} className={`flex items-start gap-3 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
        <input
            id={id}
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
            className="mt-0.5 w-5 h-5 flex-shrink-0 accent-corsia-600 cursor-pointer"
        />
        <span>
            <span className="block text-sm font-semibold text-abisso">{label}</span>
            {description && <span className="block text-xs text-slate-500 mt-0.5">{description}</span>}
        </span>
    </label>
);

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
                        className={`px-3.5 py-2 rounded-full text-sm font-semibold border transition-colors outline-none focus-visible:ring-4 focus-visible:ring-corsia-100 ${
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
