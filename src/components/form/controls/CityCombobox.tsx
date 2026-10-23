import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { fieldClass } from '../Field';
import { Highlight, Popover, normalizeText, useIsSheet } from './Popover';
import { loadAllComuni, matchComune, useComuni } from '@/data/comuni';
import { provinceName } from '@/data/italy';

type A11y = { id?: string; 'aria-invalid'?: 'true'; 'aria-describedby'?: string; className?: string };

interface Props extends A11y {
    value: string;
    /** Comune scelto e, se la ricerca era su tutta Italia, la sua provincia. */
    onChange: (city: string, province?: string) => void;
    onBlur?: () => void;
    /** Sigla della provincia: limita la scelta ai suoi comuni. Senza, cerca in tutta Italia. */
    province?: string;
    placeholder?: string;
    disabled?: boolean;
    /** Titolo del foglio su mobile. */
    label?: string;
}

const MAX_RESULTS = 60;

/**
 * Campo città con i comuni ufficiali ISTAT: si scrive e si sceglie dall'elenco.
 * Con la provincia indicata propone solo i suoi comuni; senza, cerca in tutta Italia.
 */
export const CityCombobox: React.FC<Props> = ({ value, onChange, onBlur, province, placeholder, disabled, label = 'Comune', id, className: _ignored, ...a11y }) => {
    const autoId = useId();
    const listId = `${id || autoId}-list`;
    const inputRef = useRef<HTMLInputElement>(null);
    const sheetSearchRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const sheet = useIsSheet();
    const { comuni, loading, error } = useComuni(province);
    const [all, setAll] = useState<[string, string][] | null>(null);
    const [open, setOpen] = useState(false);
    const [text, setText] = useState(value);
    /** Ricerca nel foglio su mobile: parte vuota per mostrare tutti i comuni. */
    const [sheetQuery, setSheetQuery] = useState('');
    const [active, setActive] = useState(0);
    const query = sheet ? sheetQuery : text;
    const prevProvince = useRef(province);

    useEffect(() => setText(value), [value]);

    // Ricerca su tutta Italia: scarica l'elenco completo solo se serve.
    useEffect(() => {
        if (province || !open || all) return;
        loadAllComuni().then(setAll).catch((e) => console.warn('Comuni non disponibili:', e));
    }, [province, open, all]);

    // Cambiando provincia, una città che non le appartiene viene tolta.
    useEffect(() => {
        if (prevProvince.current === province) return;
        prevProvince.current = province;
        if (!province) return;
        if (comuni.length && value && !matchComune(value, comuni)) onChange('');
    }, [province, comuni]); // eslint-disable-line react-hooks/exhaustive-deps

    const source: { name: string; code?: string }[] = useMemo(
        () => (province ? comuni.map((name) => ({ name })) : (all || []).map(([name, code]) => ({ name, code }))),
        [province, comuni, all]
    );

    const results = useMemo(() => {
        const q = normalizeText(query);
        if (!q) return province ? source.slice(0, 300) : [];
        const starts: typeof source = [];
        const contains: typeof source = [];
        for (const c of source) {
            const n = normalizeText(c.name);
            if (n.startsWith(q)) starts.push(c);
            else if (n.includes(q)) contains.push(c);
            if (starts.length >= MAX_RESULTS) break;
        }
        return [...starts, ...contains].slice(0, MAX_RESULTS);
    }, [query, source, province]);

    useEffect(() => setActive(0), [query]);
    useEffect(() => {
        if (open) listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [active, open]);
    useEffect(() => {
        if (!open || !sheet) return;
        setSheetQuery('');
        const t = window.setTimeout(() => {
            sheetSearchRef.current?.focus();
            listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'center' });
        }, 40);
        return () => window.clearTimeout(t);
    }, [open, sheet]);

    const choose = (c: { name: string; code?: string }) => {
        setText(c.name);
        onChange(c.name, c.code);
        setOpen(false);
        inputRef.current?.focus();
    };

    /** All'uscita dal campo: se il testo corrisponde a un comune usa il nome ufficiale. */
    const commit = () => {
        const exact = province ? matchComune(text, comuni) : undefined;
        if (exact) {
            if (exact !== value) onChange(exact);
            setText(exact);
        } else if (text !== value) onChange(text.trim());
        onBlur?.();
    };

    const onKey = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); else setActive((i) => Math.min(results.length - 1, i + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
        else if (e.key === 'Enter' && open && results[active]) { e.preventDefault(); choose(results[active]); }
        else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
        else if (e.key === 'Tab') setOpen(false);
    };

    const status = !province
        ? query.trim().length < 2
            ? 'Scrivi almeno due lettere del comune.'
            : !all
              ? 'Caricamento dei comuni…'
              : null
        : loading
          ? 'Caricamento dei comuni…'
          : error
            ? 'Elenco dei comuni non disponibile: controlla la connessione.'
            : null;

    const list = (
        <ul ref={listRef} id={listId} role="listbox" aria-label={label} className={`py-1.5 ${sheet ? 'px-2' : 'px-1.5'}`}>
            {status && <li className="px-3 py-4 text-sm text-slate-500">{status}</li>}
            {!status && results.length === 0 && (
                <li className="px-3 py-4 text-sm text-slate-500">
                    {province ? `Nessun comune della provincia di ${provinceName(province) || province} corrisponde a “${query}”.` : `Nessun comune corrisponde a “${query}”.`}
                </li>
            )}
            {!status &&
                results.map((c, i) => (
                    <li
                        key={`${c.name}-${c.code || ''}`}
                        id={`${listId}-${i}`}
                        data-index={i}
                        role="option"
                        aria-selected={c.name === value}
                        onPointerMove={() => setActive(i)}
                        onPointerDown={(e) => e.preventDefault()} // non perdere il focus prima del clic
                        onClick={() => choose(c)}
                        className={`flex items-center gap-2 px-3 rounded-lg cursor-pointer select-none ${sheet ? 'py-3' : 'py-2'} ${i === active ? 'bg-piastrella' : ''} ${
                            c.name === value ? 'text-corsia-700 font-semibold' : 'text-abisso'
                        }`}
                    >
                        <span className="flex-1 truncate">
                            <Highlight text={c.name} query={query} />
                        </span>
                        {c.code && <span className="text-xs text-slate-400">{c.code}</span>}
                        {c.name === value && <Icon type="check" className="w-4 h-4 text-corsia-600" />}
                    </li>
                ))}
        </ul>
    );

    const disabledByProvince = province === '';
    return (
        <>
            <div className="relative">
                <input
                    ref={inputRef}
                    id={id}
                    {...a11y}
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={open}
                    aria-controls={open ? listId : undefined}
                    aria-activedescendant={open && !sheet && results[active] ? `${listId}-${active}` : undefined}
                    value={text}
                    disabled={disabled || disabledByProvince}
                    placeholder={disabledByProvince ? 'Scegli prima la provincia' : placeholder || 'Cerca il comune'}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => {
                        setText(e.target.value);
                        if (!open) setOpen(true);
                    }}
                    onFocus={() => !sheet && setOpen(true)}
                    onClick={() => setOpen(true)}
                    onBlur={() => !sheet && window.setTimeout(() => { setOpen(false); commit(); }, 120)}
                    onKeyDown={onKey}
                    readOnly={sheet}
                    className={fieldClass(a11y['aria-invalid'] ? 'x' : undefined, 'pr-10')}
                />
                <Icon type="location" className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            <Popover
                open={open}
                anchorRef={inputRef as React.RefObject<HTMLElement>}
                onClose={() => {
                    setOpen(false);
                    if (sheet) commit();
                }}
                title={province ? `Comuni in provincia di ${provinceName(province) || province}` : label}
                maxHeight={300}
                tallSheet
            >
                {sheet && (
                    <div className="sticky top-0 bg-white px-4 pb-2 pt-1 border-b border-slate-100 z-10">
                        <input
                            ref={sheetSearchRef}
                            value={sheetQuery}
                            onChange={(e) => setSheetQuery(e.target.value)}
                            onKeyDown={onKey}
                            placeholder="Cerca il comune"
                            aria-label="Cerca il comune"
                            aria-controls={listId}
                            aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
                            className="w-full px-4 py-3 rounded-xl bg-piastrella text-abisso placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-corsia-100"
                            autoComplete="off"
                            spellCheck={false}
                        />
                    </div>
                )}
                {list}
            </Popover>
        </>
    );
};
