import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { fieldClass } from '../Field';
import { Popover, useIsSheet } from './Popover';
import { MONTHS, isValidISODate, isoToIt, itToIso, maskDate, toISODate, todayISO } from '@/utils/dates';

type A11y = { id?: string; 'aria-invalid'?: 'true'; 'aria-describedby'?: string; className?: string };

interface DatePickerProps extends A11y {
    /** Data ISO `YYYY-MM-DD`; durante la digitazione può contenere il testo parziale. */
    value: string;
    onChange: (value: string) => void;
    onBlur?: () => void;
    min?: string;
    max?: string;
    disabled?: boolean;
    placeholder?: string;
    label?: string;
}

const WEEKDAYS = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Calendario mensile in italiano, settimana da lunedì, navigabile da tastiera. */
const Calendar: React.FC<{ value: string; min?: string; max?: string; onPick: (iso: string) => void; onClose: () => void }> = ({ value, min, max, onPick, onClose }) => {
    const today = todayISO();
    const initial = isValidISODate(value) ? value : today < (min || '') ? min! : today > (max || '9999') ? max! : today;
    const [focus, setFocus] = useState(initial);
    const [mode, setMode] = useState<'days' | 'years'>('days');
    const gridRef = useRef<HTMLDivElement>(null);
    const [y, m] = [Number(focus.slice(0, 4)), Number(focus.slice(5, 7))];

    const days = useMemo(() => {
        const first = new Date(y, m - 1, 1);
        const offset = (first.getDay() + 6) % 7; // lunedì = 0
        const start = new Date(y, m - 1, 1 - offset);
        return Array.from({ length: 42 }, (_, i) => toISODate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
    }, [y, m]);

    const disabledDay = (iso: string) => (!!min && iso < min) || (!!max && iso > max);
    const move = (deltaDays: number) => {
        const d = new Date(y, m - 1, Number(focus.slice(8, 10)) + deltaDays);
        setFocus(toISODate(d));
    };
    const moveMonth = (delta: number) => {
        const day = Number(focus.slice(8, 10));
        const last = new Date(y, m - 1 + delta + 1, 0).getDate();
        setFocus(toISODate(new Date(y, m - 1 + delta, Math.min(day, last))));
    };

    useEffect(() => {
        if (mode === 'days') gridRef.current?.querySelector<HTMLElement>(`[data-iso="${focus}"]`)?.focus({ preventScroll: true });
    }, [focus, mode]);

    const onKey = (e: React.KeyboardEvent) => {
        const map: Record<string, () => void> = {
            ArrowLeft: () => move(-1),
            ArrowRight: () => move(1),
            ArrowUp: () => move(-7),
            ArrowDown: () => move(7),
            PageUp: () => moveMonth(e.shiftKey ? -12 : -1),
            PageDown: () => moveMonth(e.shiftKey ? 12 : 1),
            Home: () => move(-((new Date(y, m - 1, Number(focus.slice(8, 10))).getDay() + 6) % 7)),
            End: () => move(6 - ((new Date(y, m - 1, Number(focus.slice(8, 10))).getDay() + 6) % 7)),
            Enter: () => !disabledDay(focus) && onPick(focus),
            ' ': () => !disabledDay(focus) && onPick(focus),
            Tab: () => onClose(),
        };
        if (map[e.key]) {
            e.preventDefault();
            map[e.key]();
        }
    };

    const minYear = min ? Number(min.slice(0, 4)) : 1940;
    const maxYear = max ? Number(max.slice(0, 4)) : new Date().getFullYear() + 15;
    const years: number[] = [];
    for (let yy = maxYear; yy >= minYear; yy--) years.push(yy);
    const canPrev = !min || `${y}-${String(m).padStart(2, '0')}` > min.slice(0, 7);
    const canNext = !max || `${y}-${String(m).padStart(2, '0')}` < max.slice(0, 7);

    return (
        <div className="p-3 select-none" style={{ minWidth: 296 }}>
            <div className="flex items-center justify-between mb-2">
                <button
                    type="button"
                    onClick={() => setMode(mode === 'days' ? 'years' : 'days')}
                    className="px-2 py-1.5 rounded-lg font-semibold text-abisso hover:bg-piastrella inline-flex items-center gap-1"
                    aria-label={mode === 'days' ? 'Scegli l’anno' : 'Torna ai giorni'}
                >
                    {cap(MONTHS[m - 1])} {y}
                    <Icon type="chevron-right" className={`w-4 h-4 text-slate-400 transition-transform ${mode === 'years' ? '-rotate-90' : 'rotate-90'}`} />
                </button>
                {mode === 'days' && (
                    <div className="flex">
                        <button type="button" disabled={!canPrev} onClick={() => moveMonth(-1)} className="p-2 rounded-full hover:bg-piastrella disabled:opacity-30" aria-label="Mese precedente">
                            <Icon type="chevron-right" className="w-4 h-4 rotate-180" />
                        </button>
                        <button type="button" disabled={!canNext} onClick={() => moveMonth(1)} className="p-2 rounded-full hover:bg-piastrella disabled:opacity-30" aria-label="Mese successivo">
                            <Icon type="chevron-right" className="w-4 h-4" />
                        </button>
                    </div>
                )}
            </div>

            {mode === 'years' ? (
                <div className="grid grid-cols-4 gap-1 max-h-64 overflow-y-auto" role="listbox" aria-label="Anno">
                    {years.map((yy) => (
                        <button
                            key={yy}
                            type="button"
                            role="option"
                            aria-selected={yy === y}
                            ref={(el) => { if (el && yy === y) el.scrollIntoView({ block: 'center' }); }}
                            onClick={() => {
                                const last = new Date(yy, m, 0).getDate();
                                setFocus(toISODate(new Date(yy, m - 1, Math.min(Number(focus.slice(8, 10)), last))));
                                setMode('days');
                            }}
                            className={`py-2 rounded-lg text-sm tabular-nums ${yy === y ? 'bg-corsia-600 text-white font-semibold' : 'hover:bg-piastrella text-abisso'}`}
                        >
                            {yy}
                        </button>
                    ))}
                </div>
            ) : (
                <div ref={gridRef} role="grid" aria-label={`${cap(MONTHS[m - 1])} ${y}`} onKeyDown={onKey}>
                    <div role="row" className="grid grid-cols-7 mb-1">
                        {WEEKDAYS.map((d) => (
                            <span key={d} role="columnheader" aria-label={d} className="text-center text-xs font-semibold text-slate-400 py-1">
                                {d.charAt(0).toUpperCase()}
                            </span>
                        ))}
                    </div>
                    {[0, 1, 2, 3, 4, 5].map((w) => (
                        <div role="row" key={w} className="grid grid-cols-7">
                            {days.slice(w * 7, w * 7 + 7).map((iso) => {
                                const inMonth = Number(iso.slice(5, 7)) === m;
                                const off = disabledDay(iso);
                                const selected = iso === value;
                                const isToday = iso === today;
                                return (
                                    <span role="gridcell" key={iso} aria-selected={selected} className="p-0.5">
                                        <button
                                            type="button"
                                            data-iso={iso}
                                            tabIndex={iso === focus ? 0 : -1}
                                            disabled={off}
                                            onClick={() => onPick(iso)}
                                            aria-label={new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                            className={`w-full aspect-square rounded-full text-sm tabular-nums outline-hidden transition-colors focus-visible:ring-2 focus-visible:ring-corsia-400 ${
                                                selected
                                                    ? 'bg-corsia-600 text-white font-semibold'
                                                    : off
                                                      ? 'text-slate-300 cursor-not-allowed'
                                                      : `${inMonth ? 'text-abisso' : 'text-slate-400'} hover:bg-piastrella`
                                            } ${isToday && !selected ? 'ring-1 ring-inset ring-cloro-500 font-semibold' : ''}`}
                                        >
                                            {Number(iso.slice(8, 10))}
                                        </button>
                                    </span>
                                );
                            })}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

/**
 * Data nel formato italiano gg/mm/aaaa: si può scrivere (le barre si inseriscono da sole)
 * o scegliere dal calendario. Il valore resta ISO, come nel resto dell'app.
 */
export const DatePicker: React.FC<DatePickerProps> = ({ value, onChange, onBlur, min, max, disabled, placeholder = 'gg/mm/aaaa', label = 'Data', id, className: _ignored, ...a11y }) => {
    const autoId = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const sheet = useIsSheet();
    const [open, setOpen] = useState(false);
    const [text, setText] = useState(isoToIt(value));

    useEffect(() => {
        // Aggiorna il testo quando il valore cambia dall'esterno (calendario, reset).
        if (itToIso(text) !== value) setText(isoToIt(value));
    }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

    const pick = (iso: string) => {
        setText(isoToIt(iso));
        onChange(iso);
        setOpen(false);
        inputRef.current?.focus();
        onBlur?.();
    };

    const quick = (iso: string, text: string) =>
        (!min || iso >= min) && (!max || iso <= max) ? (
            <button type="button" onClick={() => pick(iso)} className="px-3 py-1.5 rounded-full text-sm font-semibold text-corsia-700 hover:bg-corsia-50">
                {text}
            </button>
        ) : null;

    return (
        <>
            <div ref={wrapRef} className="relative">
                <input
                    ref={inputRef}
                    id={id || autoId}
                    {...a11y}
                    value={text}
                    disabled={disabled}
                    inputMode="numeric"
                    placeholder={placeholder}
                    maxLength={10}
                    autoComplete="off"
                    onChange={(e) => {
                        const next = maskDate(e.target.value, text);
                        setText(next);
                        onChange(next ? itToIso(next) : '');
                    }}
                    onBlur={() => !open && onBlur?.()}
                    onKeyDown={(e) => {
                        if ((e.key === 'ArrowDown' && e.altKey) || e.key === 'F4') {
                            e.preventDefault();
                            setOpen(true);
                        }
                    }}
                    className={fieldClass(a11y['aria-invalid'] ? 'x' : undefined, 'pr-12 tabular-nums')}
                />
                <button
                    type="button"
                    onClick={() => setOpen((o) => !o)}
                    disabled={disabled}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-lg text-slate-500 hover:text-corsia-700 hover:bg-piastrella disabled:opacity-50"
                    aria-label={`Apri il calendario: ${label.toLowerCase()}`}
                    aria-haspopup="dialog"
                    aria-expanded={open}
                >
                    <Icon type="calendar" className="w-5 h-5" />
                </button>
            </div>
            <Popover
                open={open}
                anchorRef={wrapRef as React.RefObject<HTMLElement>}
                onClose={() => setOpen(false)}
                title={label}
                minWidth={320}
                maxHeight={420}
                footer={
                    <div className="flex items-center justify-between">
                        {quick(todayISO(), 'Oggi') || <span />}
                        {value && (
                            <button type="button" onClick={() => { setText(''); onChange(''); setOpen(false); }} className="px-3 py-1.5 rounded-full text-sm font-semibold text-slate-500 hover:bg-slate-100">
                                Cancella
                            </button>
                        )}
                    </div>
                }
            >
                <div className={sheet ? 'flex justify-center' : ''}>
                    <Calendar value={isValidISODate(value) ? value : ''} min={min} max={max} onPick={pick} onClose={() => setOpen(false)} />
                </div>
            </Popover>
        </>
    );
};
