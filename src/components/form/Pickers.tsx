import React, { useMemo } from 'react';
import { PROVINCES } from '@/data/italy';
import { Select } from './controls/Select';

export { Select } from './controls/Select';
export { DatePicker } from './controls/DatePicker';
export { TimePicker } from './controls/TimePicker';
export { MonthYearPicker } from './controls/MonthYearPicker';
export { CityCombobox } from './controls/CityCombobox';
export { SuggestInput } from './controls/SuggestInput';

type A11yProps = { id?: string; 'aria-invalid'?: 'true'; 'aria-describedby'?: string; className?: string };

/** Province (fonte ISTAT) raggruppate per regione, con ricerca per nome o sigla. */
export const ProvinceSelect: React.FC<A11yProps & { value: string; onChange: (code: string) => void; onBlur?: () => void; disabled?: boolean }> = ({
    value, onChange, onBlur, disabled, ...a11y
}) => {
    const options = useMemo(() => PROVINCES.map((p) => ({ value: p.code, label: p.name, hint: p.code, group: p.region })), []);
    return <Select {...a11y} label="Provincia" value={value} onChange={onChange} onBlur={onBlur} disabled={disabled} options={options} placeholder="Scegli la provincia" searchable />;
};
