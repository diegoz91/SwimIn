import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { fieldClass } from '../Field';
import { Highlight, Popover, normalizeText, useIsSheet } from './Popover';

type A11y = { id?: string; 'aria-invalid'?: 'true'; 'aria-describedby'?: string; className?: string };

interface Props extends A11y {
    value: string;
    onChange: (value: string) => void;
    onBlur?: () => void;
    /** Proposte: si può comunque scrivere un testo diverso. */
    options: readonly string[];
    placeholder?: string;
    maxLength?: number;
    disabled?: boolean;
    autoComplete?: string;
    label?: string;
}

/** Campo di testo libero con proposte dal vocabolario del settore (sostituisce il datalist del browser). */
export const SuggestInput: React.FC<Props> = ({ value, onChange, onBlur, options, placeholder, maxLength, disabled, autoComplete = 'off', label = 'Proposte', id, className, ...a11y }) => {
    const autoId = useId();
    const listId = `${id || autoId}-list`;
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const sheet = useIsSheet();
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);

    const results = useMemo(() => {
        const q = normalizeText(value);
        const list = q ? options.filter((o) => normalizeText(o).includes(q) && normalizeText(o) !== q) : options;
        return list.slice(0, 12);
    }, [value, options]);

    useEffect(() => setActive(-1), [value]);
    useEffect(() => {
        if (open && active >= 0) listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [active, open]);

    const choose = (v: string) => {
        onChange(v);
        setOpen(false);
        inputRef.current?.focus();
    };

    const onKey = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => Math.min(results.length - 1, i + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(-1, i - 1)); }
        else if (e.key === 'Enter' && open && active >= 0 && results[active]) { e.preventDefault(); choose(results[active]); }
        else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
        else if (e.key === 'Tab') setOpen(false);
    };

    // Su mobile le proposte restano sotto il campo (senza foglio): si continua a scrivere.
    const showList = open && results.length > 0;
    return (
        <>
            <input
                ref={inputRef}
                id={id}
                {...a11y}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={showList}
                aria-controls={showList ? listId : undefined}
                aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
                value={value}
                maxLength={maxLength}
                placeholder={placeholder}
                disabled={disabled}
                autoComplete={autoComplete}
                onChange={(e) => {
                    onChange(e.target.value);
                    setOpen(true);
                }}
                // Le proposte si aprono quando si scrive o si clicca, non col solo focus
                // (le modali mettono il focus sul primo campo e il menu coprirebbe il form).
                onClick={() => setOpen(true)}
                onBlur={() => window.setTimeout(() => { setOpen(false); onBlur?.(); }, 120)}
                onKeyDown={onKey}
                className={className ?? fieldClass(a11y['aria-invalid'] ? 'x' : undefined)}
            />
            {!sheet ? (
                <Popover open={showList} anchorRef={inputRef as React.RefObject<HTMLElement>} onClose={() => setOpen(false)} title={label} maxHeight={260}>
                    <List />
                </Popover>
            ) : (
                showList && (
                    <div className="mt-1.5 rounded-xl border border-slate-200 bg-white shadow-card overflow-hidden animate-in fade-in duration-150">
                        <List />
                    </div>
                )
            )}
        </>
    );

    function List() {
        return (
            <ul ref={listRef} id={listId} role="listbox" aria-label={label} className="py-1.5 px-1.5 max-h-56 overflow-y-auto">
                {results.map((o, i) => (
                    <li
                        key={o}
                        id={`${listId}-${i}`}
                        data-index={i}
                        role="option"
                        aria-selected={i === active}
                        onPointerMove={() => setActive(i)}
                        onPointerDown={(e) => e.preventDefault()}
                        onClick={() => choose(o)}
                        className={`px-3 py-2 rounded-lg cursor-pointer select-none text-abisso ${i === active ? 'bg-piastrella' : ''}`}
                    >
                        <Highlight text={o} query={value} />
                    </li>
                ))}
            </ul>
        );
    }
};
