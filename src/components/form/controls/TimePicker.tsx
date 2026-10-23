import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { fieldClass } from '../Field';
import { Popover, useIsSheet } from './Popover';
import { maskTime, normalizeTime } from '@/utils/dates';

type A11y = { id?: string; 'aria-invalid'?: 'true'; 'aria-describedby'?: string; className?: string };

interface TimePickerProps extends A11y {
    /** "HH:MM" (24 ore); durante la digitazione può contenere il testo parziale. */
    value: string;
    onChange: (value: string) => void;
    onBlur?: () => void;
    /** Minuti tra una proposta e l'altra nell'elenco. */
    step?: number;
    /** Orari proposti a partire da (es. "06:00"). */
    from?: string;
    to?: string;
    /** Gli orari prima di questo sono mostrati come non disponibili (es. la fine di un turno). */
    after?: string;
    disabled?: boolean;
    label?: string;
}

/** Orario in formato 24 ore: si scrive ("930" diventa 09:30) o si sceglie dall'elenco. */
export const TimePicker: React.FC<TimePickerProps> = ({
    value, onChange, onBlur, step = 15, from = '06:00', to = '23:45', after, disabled, label = 'Orario', id, className: _ignored, ...a11y
}) => {
    const autoId = useId();
    const listId = `${id || autoId}-list`;
    const wrapRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const sheet = useIsSheet();
    const [open, setOpen] = useState(false);
    const [text, setText] = useState(value);
    const [active, setActive] = useState(0);

    useEffect(() => {
        if (normalizeTime(text) !== value) setText(value);
    }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

    const times = useMemo(() => {
        const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
        const list: string[] = [];
        for (let m = toMin(from); m <= toMin(to); m += step) list.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
        return list;
    }, [from, to, step]);

    useEffect(() => {
        if (!open) return;
        const target = /^\d{2}:\d{2}$/.test(value) ? value : after || '';
        let i = times.findIndex((t) => t >= target);
        if (i < 0) i = 0;
        setActive(i);
        window.setTimeout(() => listRef.current?.querySelector<HTMLElement>(`[data-index="${i}"]`)?.scrollIntoView({ block: 'center' }), 10);
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (open) listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [active, open]);

    const choose = (t: string) => {
        setText(t);
        onChange(t);
        setOpen(false);
        inputRef.current?.focus();
        onBlur?.();
    };

    const onKey = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); else setActive((i) => Math.min(times.length - 1, i + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
        else if (e.key === 'Enter' && open) { e.preventDefault(); choose(times[active]); }
        else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
        else if (e.key === 'Tab') setOpen(false);
    };

    return (
        <>
            <div ref={wrapRef} className="relative">
                <input
                    ref={inputRef}
                    id={id || autoId}
                    {...a11y}
                    role="combobox"
                    aria-expanded={open}
                    aria-controls={open ? listId : undefined}
                    aria-activedescendant={open ? `${listId}-${active}` : undefined}
                    value={text}
                    disabled={disabled}
                    inputMode="numeric"
                    placeholder="hh:mm"
                    maxLength={5}
                    autoComplete="off"
                    onChange={(e) => {
                        const next = maskTime(e.target.value, text);
                        setText(next);
                        onChange(normalizeTime(next));
                    }}
                    onBlur={() => {
                        const n = normalizeTime(text);
                        if (n !== text) setText(n);
                        if (!open) onBlur?.();
                    }}
                    onKeyDown={onKey}
                    className={fieldClass(a11y['aria-invalid'] ? 'x' : undefined, 'pr-12 tabular-nums')}
                />
                <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setOpen((o) => !o)}
                    disabled={disabled}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-lg text-slate-500 hover:text-corsia-700 hover:bg-piastrella disabled:opacity-50"
                    aria-label={`Scegli ${label.toLowerCase()}`}
                >
                    <Icon type="clock" className="w-5 h-5" />
                </button>
            </div>
            <Popover open={open} anchorRef={wrapRef as React.RefObject<HTMLElement>} onClose={() => setOpen(false)} title={label} maxHeight={260} minWidth={140}>
                <ul ref={listRef} id={listId} role="listbox" aria-label={label} className={`py-1.5 ${sheet ? 'px-2 grid grid-cols-4 gap-1' : 'px-1.5'}`}>
                    {times.map((t, i) => {
                        const before = !!after && /^\d{2}:\d{2}$/.test(after) && t <= after;
                        const selected = t === value;
                        return (
                            <li
                                key={t}
                                id={`${listId}-${i}`}
                                data-index={i}
                                role="option"
                                aria-selected={selected}
                                aria-disabled={before || undefined}
                                onPointerMove={() => setActive(i)}
                                onPointerDown={(e) => e.preventDefault()}
                                onClick={() => !before && choose(t)}
                                className={`px-3 rounded-lg tabular-nums select-none ${sheet ? 'py-3 text-center' : 'py-2'} ${
                                    before ? 'text-slate-300 cursor-not-allowed' : 'cursor-pointer'
                                } ${i === active && !before ? 'bg-piastrella' : ''} ${selected ? 'bg-corsia-600 text-white font-semibold' : before ? '' : 'text-abisso'}`}
                            >
                                {t}
                            </li>
                        );
                    })}
                </ul>
            </Popover>
        </>
    );
};
