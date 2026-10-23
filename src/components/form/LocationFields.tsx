import React from 'react';
import { Field } from './Field';
import { CityCombobox, ProvinceSelect } from './Pickers';

interface Props {
    idPrefix: string;
    province: string;
    city: string;
    onProvince: (code: string) => void;
    onCity: (city: string) => void;
    onTouch: (key: 'province' | 'city') => void;
    errors: { province?: string; city?: string };
    provinceOptional?: boolean;
    cityLabel?: string;
    /** Campo aggiuntivo sulla stessa riga (es. CAP). */
    extra?: React.ReactNode;
}

/**
 * Provincia e comune collegati: prima la provincia, poi solo i suoi comuni (fonte ISTAT).
 * Cambiando provincia, la città che non le appartiene viene tolta.
 */
export const LocationFields: React.FC<Props> = ({ idPrefix, province, city, onProvince, onCity, onTouch, errors, provinceOptional, cityLabel = 'Comune', extra }) => (
    <div className={`grid grid-cols-1 gap-4 ${extra ? 'sm:grid-cols-[1fr_1.2fr_7.5rem]' : 'sm:grid-cols-[1fr_1.2fr]'}`}>
        <Field id={`${idPrefix}-prov`} label="Provincia" optional={provinceOptional} error={errors.province}>
            <ProvinceSelect value={province} onChange={onProvince} onBlur={() => onTouch('province')} />
        </Field>
        <Field id={`${idPrefix}-city`} label={cityLabel} error={errors.city} hint={!province ? 'Scegli prima la provincia.' : undefined}>
            <CityCombobox value={city} onChange={onCity} onBlur={() => onTouch('city')} province={province} label={cityLabel} />
        </Field>
        {extra}
    </div>
);
