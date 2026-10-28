import React from 'react';
import { Icon } from '@/components/ui/Icon';
import type { RegistrationData } from '@/hooks/useAuth';

export type AccountChoice = 'lavoro' | 'passione' | 'struttura';

export const ACCOUNT_TYPES: { id: AccountChoice; title: string; description: string; icon: 'briefcase' | 'heart' | 'building' }[] = [
    { id: 'lavoro', title: 'Lavoro nel nuoto', description: 'Istruttore, assistente bagnanti, allenatore…', icon: 'briefcase' },
    { id: 'passione', title: 'Nuoto per passione', description: 'Corsi, master, nuoto libero, community', icon: 'heart' },
    { id: 'struttura', title: 'Struttura', description: 'Piscina, centro sportivo, società', icon: 'building' },
];

export const initialChoice = (tipo: string | null | undefined): AccountChoice => (tipo === 'struttura' ? 'struttura' : tipo === 'passione' ? 'passione' : 'lavoro');

/** Dati di registrazione dal tipo scelto. */
export const registrationOf = (choice: AccountChoice, names: { firstName?: string; lastName?: string; structureName?: string }): RegistrationData => {
    const clean = (v = '') => v.trim().replace(/\s+/g, ' ');
    return {
        userType: choice === 'struttura' ? 'structure' : 'professional',
        personType: choice === 'passione' ? 'enthusiast' : choice === 'lavoro' ? 'professional' : undefined,
        firstName: clean(names.firstName),
        lastName: clean(names.lastName),
        structureName: clean(names.structureName),
    };
};

/** Scelta del tipo di account: tre schede a pulsante radio. */
export const AccountTypePicker: React.FC<{ value: AccountChoice; onChange: (c: AccountChoice) => void; disabled?: boolean; legend?: string }> = ({ value, onChange, disabled, legend = 'Mi iscrivo come' }) => (
    <fieldset>
        <legend className="block text-sm font-semibold text-slate-700 mb-2">{legend}</legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5" role="radiogroup">
            {ACCOUNT_TYPES.map((t) => {
                const selected = value === t.id;
                return (
                    <button
                        key={t.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => onChange(t.id)}
                        disabled={disabled}
                        className={`text-left p-3 rounded-2xl border-2 transition-all outline-hidden focus-visible:ring-2 focus-visible:ring-corsia-500 flex sm:block items-center gap-3 ${
                            selected ? 'border-corsia-600 bg-corsia-50' : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                    >
                        <Icon type={t.icon} className={`w-6 h-6 sm:mb-1 shrink-0 ${selected ? 'text-corsia-600' : 'text-slate-400'}`} />
                        <span>
                            <span className={`block font-bold text-sm ${selected ? 'text-corsia-800' : 'text-slate-800'}`}>{t.title}</span>
                            <span className="block text-[11px] leading-tight text-slate-500 mt-0.5">{t.description}</span>
                        </span>
                    </button>
                );
            })}
        </div>
    </fieldset>
);
