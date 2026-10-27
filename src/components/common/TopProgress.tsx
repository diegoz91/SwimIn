import React, { useEffect, useRef, useState } from 'react';

/**
 * Barra di avanzamento sottile in cima allo schermo, nei colori della corsia: compare quando
 * una pagina o i suoi dati si stanno caricando (ogni `PageLoader` montato la tiene accesa).
 * Avanza da sola fino all'80%, poi si completa e sparisce quando il caricamento finisce.
 */
let active = 0;
const listeners = new Set<(n: number) => void>();
const emit = () => listeners.forEach((l) => l(active));

export const startProgress = () => { active += 1; emit(); };
export const doneProgress = () => { active = Math.max(0, active - 1); emit(); };

/** Tiene accesa la barra finché il componente che la usa è montato. */
export function useTopProgress(on = true) {
    useEffect(() => {
        if (!on) return;
        startProgress();
        return doneProgress;
    }, [on]);
}

export const TopProgress: React.FC = () => {
    const [width, setWidth] = useState(0);
    const [visible, setVisible] = useState(false);
    const timer = useRef<number>(0);

    useEffect(() => {
        const onChange = (n: number) => {
            window.clearInterval(timer.current);
            if (n > 0) {
                setVisible(true);
                setWidth((w) => (w > 0 && w < 80 ? w : 8));
                // Avanza sempre più piano verso l'80%: non arriva mai in fondo finché non ha finito.
                timer.current = window.setInterval(() => setWidth((w) => (w < 80 ? w + (80 - w) * 0.08 : w)), 200);
            } else {
                setWidth(100);
                timer.current = window.setTimeout(() => { setVisible(false); setWidth(0); }, 350) as unknown as number;
            }
        };
        listeners.add(onChange);
        if (active > 0) onChange(active);
        return () => { listeners.delete(onChange); window.clearInterval(timer.current); };
    }, []);

    return (
        <div aria-hidden="true" className="fixed inset-x-0 top-0 z-[120] h-[3px] pointer-events-none" style={{ top: 'env(safe-area-inset-top)' }}>
            <div
                className="h-full rounded-r-full bg-linear-to-r from-corsia-600 via-cloro-500 to-corsia-500 shadow-[0_0_8px_rgba(14,165,233,0.45)] transition-[width,opacity] duration-300 ease-out"
                style={{ width: `${width}%`, opacity: visible ? 1 : 0 }}
            />
        </div>
    );
};
