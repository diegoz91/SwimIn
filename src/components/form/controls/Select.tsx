import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Highlight, Popover, normalizeText, useIsSheet } from './Popover';

export interface SelectOption<V extends string = string> {
    value: V;
    label: string;
    /** Intestazione di gruppo (come gli optgroup). */
    group?: string;
    /** Testo secondario a destra (es. la sigla della provincia). */
    hint?: string;
}

type A11y = { id?: string; 'aria-invalid'?: 'true'; 'aria-describedby'?: string; className?: string };

interface SelectProps<V extends string> extends A11y {
    value: V | '';
    onChange: (value: V) => void;
    options: SelectOption<V>[];
    placeholder?: string;
    disabled?: boolean;
    onBlur?: () => void;
    /** Campo di ricerca nel menu; di default attivo con più di 10 voci. */
    searchable?: boolean;
    /** Titolo del foglio su mobile e nome accessibile del menu. */
    label: string;
    /** Voce per svuotare la scelta (es. "Non specificato"). */
    clearLabel?: string;
    size?: 'md' | 'sm';
}

export const triggerClass = (invalid: boolean, disabled?: boolean, size: 'md' | 'sm' = 'md') =>
    `w-full flex items-center gap-2 text-left rounded-xl border bg-white outline-none transition-[border-color,box-shadow] duration-150 focus-visible:ring-4 ${
        size === 'sm' ? 'px-3 py-2 text-sm font-semibold' : 'px-4 py-3'
    } ${invalid ? 'border-galleggiante focus-visible:ring-red-100' : 'border-slate-200 hover:border-slate-300 focus-visible:border-corsia-400 focus-visible:ring-corsia-100'} ${
        disabled ? 'opacity-60 bg-slate-50 cursor-not-allowed' : 'cursor-pointer'
    }`;

/** Menu a tendina del sito: ricerca, tastiera, gruppi e foglio dal basso su mobile. */
export function Select<V extends string = string>({
    value, onChange, options, placeholder = 'Scegli…', disabled, onBlur, searchable, label, clearLabel, size = 'md', id, className: _ignored, ...a11y
}: SelectProps<V>) {
    const autoId = useId();
    const listId = `${id || autoId}-list`;
    const triggerRef = useRef<HTMLButtonElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const sheet = useIsSheet();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const typeahead = useRef({ text: '', at: 0 });

    const withSearch = searchable ?? options.length > 10;
    const all = useMemo<(SelectOption<V> | { value: ''; label: string; group?: undefined; hint?: undefined })[]>(
        () => (clearLabel ? [{ value: '' as const, label: clearLabel }, ...options] : options),
        [options, clearLabel]
    );
    const filtered = useMemo(() => {
        const q = normalizeText(query);
        if (!q) return all;
        return all.filter((o) => o.value !== '' && (normalizeText(o.label).includes(q) || normalizeText(o.hint || '').startsWith(q) || normalizeText(o.group || '').includes(q)));
    }, [all, query]);
    const selected = options.find((o) => o.value === value);

    const openMenu = () => {
        if (disabled) return;
        setQuery('');
        setOpen(true);
        const i = all.findIndex((o) => o.value === value);
        setActive(i >= 0 ? i : 0);
    };
    const close = (refocus = true) => {
        setOpen(false);
        if (refocus) triggerRef.current?.focus();
        onBlur?.();
    };
    const choose = (v: V | '') => {
        onChange(v as V);
        close();
    };

    useEffect(() => {
        if (!open) return;
        const t = window.setTimeout(() => (withSearch ? searchRef.current?.focus() : listRef.current?.focus()), 20);
        return () => window.clearTimeout(t);
    }, [open, withSearch]);

    useEffect(() => {
        if (!open) return;
        listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [active, open, filtered]);

    useEffect(() => setActive(0), [query]);

    const onListKey = (e: React.KeyboardEvent) => {
        const last = filtered.length - 1;
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(last, i + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
        else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
        else if (e.key === 'End') { e.preventDefault(); setActive(last); }
        else if (e.key === 'PageDown') { e.preventDefault(); setActive((i) => Math.min(last, i + 8)); }
        else if (e.key === 'PageUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 8)); }
        else if (e.key === 'Enter') { e.preventDefault(); if (filtered[active]) choose(filtered[active].value as V); }
        else if (e.key === 'Tab') { e.preventDefault(); close(); }
        else if (!withSearch && e.key.length === 1 && /\S/.test(e.key)) {
            // ricerca rapida digitando le prime lettere
            const now = Date.now();
            typeahead.current = { text: (now - typeahead.current.at < 700 ? typeahead.current.text : '') + e.key.toLowerCase(), at: now };
            const i = filtered.findIndex((o) => normalizeText(o.label).startsWith(typeahead.current.text));
            if (i >= 0) setActive(i);
        }
    };

    const onTriggerKey = (e: React.KeyboardEvent) => {
        if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
            e.preventDefault();
            openMenu();
        }
    };

    let lastGroup: string | undefined;
    return (
        <>
            <button
                ref={triggerRef}
                id={id}
                type="button"
                role="combobox"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={open ? listId : undefined}
                aria-label={selected ? undefined : label}
                {...a11y}
                disabled={disabled}
                onClick={() => (open ? close() : openMenu())}
                onKeyDown={onTriggerKey}
                className={triggerClass(!!a11y['aria-invalid'], disabled, size)}
            >
                <span className={`flex-1 truncate ${selected ? 'text-abisso' : 'text-slate-400'}`}>
                    {selected ? selected.label : placeholder}
                    {selected?.hint && <span className="text-slate-400 ml-1.5">{selected.hint}</span>}
                </span>
                <Icon type="chevron-right" className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform duration-150 ${open ? '-rotate-90' : 'rotate-90'}`} />
            </button>

            <Popover open={open} anchorRef={triggerRef} onClose={() => close(false)} title={label} id={`${listId}-panel`} minWidth={withSearch ? 260 : undefined}>
                {withSearch && (
                    <div className={`sticky top-0 bg-white p-2 border-b border-slate-100 z-10 ${sheet ? 'px-4' : ''}`}>
                        <div className="relative">
                            <Icon type="search" className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                                ref={searchRef}
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={onListKey}
                                placeholder="Cerca…"
                                aria-label={`Cerca in ${label.toLowerCase()}`}
                                aria-controls={listId}
                                aria-activedescendant={filtered[active] ? `${listId}-${active}` : undefined}
                                className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-piastrella text-sm text-abisso placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-corsia-100"
                                autoComplete="off"
                                spellCheck={false}
                            />
                        </div>
                    </div>
                )}
                <ul
                    ref={listRef}
                    id={listId}
                    role="listbox"
                    aria-label={label}
                    tabIndex={withSearch ? -1 : 0}
                    aria-activedescendant={!withSearch && filtered[active] ? `${listId}-${active}` : undefined}
                    onKeyDown={withSearch ? undefined : onListKey}
                    className={`py-1.5 outline-none ${sheet ? 'px-2' : 'px-1.5'}`}
                >
                    {filtered.length === 0 && <li className="px-3 py-6 text-sm text-center text-slate-500">Nessun risultato per “{query}”.</li>}
                    {filtered.map((o, i) => {
                        const header = o.group && o.group !== lastGroup ? o.group : null;
                        lastGroup = o.group;
                        const isSelected = o.value === value;
                        return (
                            <React.Fragment key={`${o.value}-${i}`}>
                                {header && <li role="presentation" className="px-3 pt-3 pb-1 text-xs font-semibold text-slate-400">{header}</li>}
                                <li
                                    id={`${listId}-${i}`}
                                    data-index={i}
                                    role="option"
                                    aria-selected={isSelected}
                                    onPointerMove={() => setActive(i)}
                                    onClick={() => choose(o.value as V)}
                                    className={`flex items-center gap-2 px-3 rounded-lg cursor-pointer select-none ${sheet ? 'py-3' : 'py-2'} ${
                                        i === active ? 'bg-piastrella' : ''
                                    } ${isSelected ? 'text-corsia-700 font-semibold' : o.value === '' ? 'text-slate-500' : 'text-abisso'}`}
                                >
                                    <span className="flex-1 min-w-0 truncate">
                                        <Highlight text={o.label} query={query} />
                                    </span>
                                    {o.hint && <span className="text-xs text-slate-400 tabular-nums">{o.hint}</span>}
                                    {isSelected && <Icon type="check" className="w-4 h-4 text-corsia-600 flex-shrink-0" />}
                                </li>
                            </React.Fragment>
                        );
                    })}
                </ul>
            </Popover>
        </>
    );
}
