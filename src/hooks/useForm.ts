import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type FormErrors<T> = Partial<Record<keyof T, string>>;

/**
 * Stato e validazione di un form.
 * - `validate` è una funzione pura dei valori: gli errori sono sempre aggiornati,
 *   ma vengono mostrati solo per i campi già visitati o dopo il primo invio.
 * - All'invio con errori il focus va sul primo campo non valido.
 */
export function useForm<T extends Record<string, unknown>>(initial: T, validate: (values: T) => FormErrors<T>) {
    const [values, setValues] = useState<T>(initial);
    const [baseline, setBaseline] = useState<T>(initial);
    const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});
    const [submitCount, setSubmitCount] = useState(0);
    const formRef = useRef<HTMLFormElement>(null);

    const allErrors = useMemo(() => validate(values), [values, validate]);
    const isValid = Object.values(allErrors).every((e) => !e);

    const errors = useMemo(() => {
        const visible: FormErrors<T> = {};
        (Object.keys(allErrors) as (keyof T)[]).forEach((k) => {
            if (allErrors[k] && (submitCount > 0 || touched[k])) visible[k] = allErrors[k];
        });
        return visible;
    }, [allErrors, touched, submitCount]);

    const set = useCallback(<K extends keyof T>(key: K, value: T[K]) => setValues((prev) => ({ ...prev, [key]: value })), []);
    const patch = useCallback((partial: Partial<T>) => setValues((prev) => ({ ...prev, ...partial })), []);
    const touch = useCallback((key: keyof T) => setTouched((prev) => (prev[key] ? prev : { ...prev, [key]: true })), []);

    /** Ricomincia da nuovi valori (es. quando si riapre una modale). */
    const reset = useCallback((next: T) => {
        setValues(next);
        setBaseline(next);
        setTouched({});
        setSubmitCount(0);
    }, []);

    const isDirty = useMemo(() => JSON.stringify(values) !== JSON.stringify(baseline), [values, baseline]);

    useEffect(() => {
        if (!submitCount) return;
        const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
        first?.focus();
        first?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, [submitCount]);

    /** Collega un input testuale: valore, onChange, onBlur e stato d'errore. */
    const bind = useCallback(
        (key: keyof T) => ({
            name: String(key),
            value: (values[key] as unknown as string) ?? '',
            onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(key, e.target.value as T[keyof T]),
            onBlur: () => touch(key),
        }),
        [values, set, touch]
    );

    /** Collega un controllo personalizzato (Select, DatePicker, CityCombobox…): valore, onChange(valore), onBlur. */
    const field = useCallback(
        <K extends keyof T>(key: K) => ({
            value: values[key],
            onChange: (value: T[K]) => set(key, value),
            onBlur: () => touch(key),
        }),
        [values, set, touch]
    );

    const handleSubmit = useCallback(
        (onValid: (values: T) => void | Promise<void>) => (e?: React.FormEvent) => {
            e?.preventDefault();
            setSubmitCount((n) => n + 1);
            if (!isValid) return;
            return onValid(values);
        },
        [isValid, values]
    );

    return { values, set, patch, errors, allErrors, isValid, isDirty, touch, bind, field, reset, handleSubmit, formRef, submitCount };
}
