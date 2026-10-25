import { useEffect, useState } from 'react';
import { getThemePref, resolveTheme, setThemePref, type ThemePref } from '@/utils/theme';

/** Preferenza del tema e tema effettivo, aggiornati anche se cambiano da un altro punto dell'app. */
export function useTheme() {
    const [pref, setPref] = useState<ThemePref>(getThemePref);
    const [resolved, setResolved] = useState(() => resolveTheme(getThemePref()));

    useEffect(() => {
        const sync = () => {
            const p = getThemePref();
            setPref(p);
            setResolved(resolveTheme(p));
        };
        window.addEventListener('swimin-theme', sync);
        const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
        mq?.addEventListener('change', sync);
        return () => {
            window.removeEventListener('swimin-theme', sync);
            mq?.removeEventListener('change', sync);
        };
    }, []);

    return { pref, resolved, setTheme: setThemePref };
}
