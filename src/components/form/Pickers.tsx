import React, { useEffect, useState } from 'react';
import { PROVINCES, REGIONS } from '@/data/italy';
import { MONTHS } from '@/utils/dates';
import { fieldClass } from './Field';

type A11yProps = { id?: string; 'aria-invalid'?: 'true'; 'aria-describedby'?: string; className?: string };

/** Province raggruppate per regione; il valore è la sigla. */
export const ProvinceSelect: React.FC<A11yProps & { value: string; onChange: (code: string) => void; onBlur?: () => void; disabled?: boolean }> = ({
    value, onChange, onBlur, disabled, className, ...a11y
}) => (
    <select
        {...a11y}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        className={className ?? fieldClass(a11y['aria-invalid'] ? 'x' : undefined)}
        autoComplete="address-level1"
    >
        <option value="">Scegli…</option>
        {REGIONS.map((region) => (
            <optgroup key={region} label={region}>
                {PROVINCES.filter((p) => p.region === region).map((p) => (
                    <option key={p.code} value={p.code}>
                        {p.name} ({p.code})
                    </option>
                ))}
            </optgroup>
        ))}
    </select>
);

/**
 * Mese e anno con due elenchi: funziona su tutti i browser (l'input `month`
 * nativo non è supportato da Safari desktop e Firefox). Valore `YYYY-MM` o ''.
 */
export const MonthYearPicker: React.FC<
    A11yProps & { value: string; onChange: (value: string) => void; onBlur?: () => void; minYear?: number; maxYear?: number; disabled?: boolean; label: string }
> = ({ value, onChange, onBlur, minYear = 1960, maxYear = new Date().getFullYear(), disabled, label, id, className: _ignored, ...a11y }) => {
    const [year, setYear] = useState(value ? value.slice(0, 4) : '');
    const [month, setMonth] = useState(value ? value.slice(5, 7) : '');

    // Allinea lo stato interno quando il valore cambia dall'esterno (apertura, reset),
    // senza cancellare la metà già scelta mentre l'utente compila l'altra.
    useEffect(() => {
        if (value) {
            setYear(value.slice(0, 4));
            setMonth(value.slice(5, 7));
        } else if (year && month) {
            setYear('');
            setMonth('');
        }
    }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

    const emit = (y: string, m: string) => onChange(y && m ? `${y}-${m}` : '');
    const years: number[] = [];
    for (let y = maxYear; y >= minYear; y--) years.push(y);
    const invalid = a11y['aria-invalid'] ? 'x' : undefined;

    return (
        <div className="grid grid-cols-[1.4fr_1fr] gap-2" role="group" aria-label={label}>
            <select
                id={id}
                {...a11y}
                aria-label={`${label}: mese`}
                value={month}
                disabled={disabled}
                onBlur={onBlur}
                onChange={(e) => {
                    setMonth(e.target.value);
                    emit(year, e.target.value);
                }}
                className={fieldClass(invalid, 'px-3')}
            >
                <option value="">Mese</option>
                {MONTHS.map((m, i) => (
                    <option key={m} value={String(i + 1).padStart(2, '0')}>
                        {m.charAt(0).toUpperCase() + m.slice(1)}
                    </option>
                ))}
            </select>
            <select
                aria-label={`${label}: anno`}
                aria-invalid={a11y['aria-invalid']}
                value={year}
                disabled={disabled}
                onBlur={onBlur}
                onChange={(e) => {
                    setYear(e.target.value);
                    emit(e.target.value, month);
                }}
                className={fieldClass(invalid, 'px-3')}
            >
                <option value="">Anno</option>
                {years.map((y) => (
                    <option key={y} value={y}>
                        {y}
                    </option>
                ))}
            </select>
        </div>
    );
};

/** Suggerimenti per un input testuale (datalist nativo). */
export const Suggestions: React.FC<{ id: string; options: readonly string[] }> = ({ id, options }) => (
    <datalist id={id}>
        {options.map((o) => (
            <option key={o} value={o} />
        ))}
    </datalist>
);
