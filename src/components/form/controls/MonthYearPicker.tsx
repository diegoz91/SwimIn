import React, { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Popover } from './Popover';
import { triggerClass } from './Select';
import { MONTHS } from '@/utils/dates';

type A11y = { id?: string; 'aria-invalid'?: 'true'; 'aria-describedby'?: string; className?: string };

const SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Mese e anno (`YYYY-MM`): un pannello con l'anno in alto e i dodici mesi sotto. */
export const MonthYearPicker: React.FC<
    A11y & { value: string; onChange: (value: string) => void; onBlur?: () => void; minYear?: number; maxYear?: number; disabled?: boolean; label: string; placeholder?: string }
> = ({ value, onChange, onBlur, minYear = 1960, maxYear = new Date().getFullYear(), disabled, label, placeholder = 'Mese e anno', id, className: _ignored, ...a11y }) => {
    const autoId = useId();
    const triggerRef = useRef<HTMLButtonElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const valueYear = value ? Number(value.slice(0, 4)) : undefined;
    const valueMonth = value ? Number(value.slice(5, 7)) : undefined;
    const [year, setYear] = useState(valueYear || Math.min(maxYear, new Date().getFullYear()));
    const [focusMonth, setFocusMonth] = useState(valueMonth || 1);
    const now = new Date();
    const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    useEffect(() => {
        if (!open) return;
        setYear(valueYear || Math.min(maxYear, now.getFullYear()));
        setFocusMonth(valueMonth || (valueYear ? 1 : now.getMonth() + 1));
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (open) window.setTimeout(() => gridRef.current?.querySelector<HTMLElement>(`[data-month="${focusMonth}"]`)?.focus({ preventScroll: true }), 20);
    }, [open, focusMonth, year]);

    const key = (m: number) => `${year}-${String(m).padStart(2, '0')}`;
    // Mesi futuri non selezionabili quando l'anno massimo è quello in corso.
    const disabledMonth = (m: number) => maxYear === now.getFullYear() && key(m) > nowKey;

    const pick = (m: number) => {
        if (disabledMonth(m)) return;
        onChange(key(m));
        setOpen(false);
        triggerRef.current?.focus();
        onBlur?.();
    };

    const onKey = (e: React.KeyboardEvent) => {
        const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 };
        if (moves[e.key] !== undefined) {
            e.preventDefault();
            let m = focusMonth + moves[e.key];
            let y = year;
            if (m < 1) { m += 12; y -= 1; }
            if (m > 12) { m -= 12; y += 1; }
            if (y >= minYear && y <= maxYear) { setYear(y); setFocusMonth(m); }
        } else if (e.key === 'PageUp') { e.preventDefault(); setYear((y) => Math.max(minYear, y - 1)); }
        else if (e.key === 'PageDown') { e.preventDefault(); setYear((y) => Math.min(maxYear, y + 1)); }
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(focusMonth); }
        else if (e.key === 'Tab') { e.preventDefault(); setOpen(false); triggerRef.current?.focus(); }
    };

    return (
        <>
            <button
                ref={triggerRef}
                id={id || autoId}
                type="button"
                aria-haspopup="dialog"
                aria-expanded={open}
                {...a11y}
                disabled={disabled}
                onClick={() => setOpen((o) => !o)}
                onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); }
                }}
                className={triggerClass(!!a11y['aria-invalid'], disabled)}
            >
                <Icon type="calendar" className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className={`flex-1 truncate ${value ? 'text-abisso' : 'text-slate-400'}`}>
                    {value ? `${cap(MONTHS[(valueMonth || 1) - 1])} ${valueYear}` : disabled ? '—' : placeholder}
                </span>
                <Icon type="chevron-right" className={`w-4 h-4 text-slate-400 transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} />
            </button>
            <Popover open={open} anchorRef={triggerRef as React.RefObject<HTMLElement>} onClose={() => { setOpen(false); onBlur?.(); }} title={label} minWidth={280} maxHeight={340}>
                <div className="p-3 select-none" role="dialog" aria-label={label}>
                    <div className="flex items-center justify-between mb-3">
                        <button type="button" onClick={() => setYear((y) => Math.max(minYear, y - 1))} disabled={year <= minYear} className="p-2 rounded-full hover:bg-piastrella disabled:opacity-30" aria-label="Anno precedente">
                            <Icon type="chevron-right" className="w-4 h-4 rotate-180" />
                        </button>
                        <span className="font-display text-2xl font-bold text-abisso tabular-nums" aria-live="polite">{year}</span>
                        <button type="button" onClick={() => setYear((y) => Math.min(maxYear, y + 1))} disabled={year >= maxYear} className="p-2 rounded-full hover:bg-piastrella disabled:opacity-30" aria-label="Anno successivo">
                            <Icon type="chevron-right" className="w-4 h-4" />
                        </button>
                    </div>
                    <div ref={gridRef} className="grid grid-cols-3 gap-1.5" onKeyDown={onKey} role="listbox" aria-label={`Mesi del ${year}`}>
                        {SHORT.map((s, i) => {
                            const m = i + 1;
                            const selected = valueYear === year && valueMonth === m;
                            const off = disabledMonth(m);
                            return (
                                <button
                                    key={s}
                                    type="button"
                                    role="option"
                                    aria-selected={selected}
                                    aria-label={`${MONTHS[i]} ${year}`}
                                    data-month={m}
                                    tabIndex={m === focusMonth ? 0 : -1}
                                    disabled={off}
                                    onClick={() => pick(m)}
                                    className={`py-2.5 rounded-xl text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-corsia-400 ${
                                        selected ? 'bg-corsia-600 text-white' : off ? 'text-slate-300 cursor-not-allowed' : 'text-abisso hover:bg-piastrella'
                                    } ${key(m) === nowKey && !selected ? 'ring-1 ring-inset ring-cloro-500' : ''}`}
                                >
                                    {cap(s)}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </Popover>
        </>
    );
};
