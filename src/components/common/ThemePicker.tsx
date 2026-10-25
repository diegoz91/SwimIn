import React from 'react';
import { Icon, type IconType } from '@/components/ui/Icon';
import { useTheme } from '@/hooks/useTheme';
import type { ThemePref } from '@/utils/theme';

const OPTIONS: { value: ThemePref; label: string; icon: IconType }[] = [
    { value: 'light', label: 'Chiaro', icon: 'sun' },
    { value: 'dark', label: 'Scuro', icon: 'moon' },
    { value: 'system', label: 'Automatico', icon: 'computer' },
];

/** Scelta compatta del tema (menu dell'avatar). */
export const ThemeSegmented: React.FC = () => {
    const { pref, setTheme } = useTheme();
    return (
        <div role="radiogroup" aria-label="Tema" className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
            {OPTIONS.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={pref === o.value}
                    onClick={() => setTheme(o.value)}
                    className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-corsia-400 ${
                        pref === o.value ? 'bg-white text-abisso shadow-sm' : 'text-slate-600 hover:text-abisso'
                    }`}
                >
                    <Icon type={o.icon} className="w-4 h-4" /> {o.label}
                </button>
            ))}
        </div>
    );
};

/** Anteprima di una pagina nel tema indicato (impostazioni › Aspetto). */
const Preview: React.FC<{ mode: 'light' | 'dark' | 'split' }> = ({ mode }) => {
    const pane = (dark: boolean) => (
        <div className={`h-full p-2 ${dark ? 'bg-[#08131A]' : 'bg-[#F2F8FA]'}`}>
            <div className={`h-2 w-10 rounded-full mb-2 ${dark ? 'bg-[#1679AB]' : 'bg-[#0E6A97]'}`} />
            <div className={`rounded-md p-1.5 space-y-1 ${dark ? 'bg-[#0F1D27]' : 'bg-white'}`}>
                <div className={`h-1.5 w-3/4 rounded-full ${dark ? 'bg-[#CDD6E0]' : 'bg-[#0A2738]'}`} />
                <div className={`h-1.5 w-1/2 rounded-full ${dark ? 'bg-[#33485B]' : 'bg-[#CBD5E1]'}`} />
            </div>
        </div>
    );
    return (
        <div className="h-20 rounded-lg overflow-hidden border border-slate-200 flex" aria-hidden="true">
            {mode === 'split' ? (
                <>
                    <div className="w-1/2">{pane(false)}</div>
                    <div className="w-1/2">{pane(true)}</div>
                </>
            ) : (
                <div className="w-full">{pane(mode === 'dark')}</div>
            )}
        </div>
    );
};

/** Scelta del tema con anteprime (impostazioni). */
export const ThemeCards: React.FC = () => {
    const { pref, setTheme } = useTheme();
    const hints: Record<ThemePref, string> = { light: 'Sempre chiaro.', dark: 'Più riposante la sera e a bordo vasca.', system: 'Segue il tuo dispositivo.' };
    return (
        <div role="radiogroup" aria-label="Tema" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {OPTIONS.map((o) => {
                const on = pref === o.value;
                return (
                    <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setTheme(o.value)}
                        className={`text-left rounded-2xl border-2 p-3 transition-colors outline-none focus-visible:ring-4 focus-visible:ring-corsia-100 ${on ? 'border-corsia-600 bg-corsia-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                    >
                        <Preview mode={o.value === 'system' ? 'split' : o.value} />
                        <span className="mt-3 flex items-center gap-2 font-semibold text-abisso">
                            <span className={`w-5 h-5 rounded-full border-2 grid place-items-center ${on ? 'border-corsia-600' : 'border-slate-300'}`} aria-hidden="true">
                                {on && <span className="w-2.5 h-2.5 rounded-full bg-corsia-600" />}
                            </span>
                            <Icon type={o.icon} className="w-4 h-4 text-slate-500" /> {o.label}
                        </span>
                        <span className="block text-sm text-slate-500 mt-1 ml-7">{hints[o.value]}</span>
                    </button>
                );
            })}
        </div>
    );
};
