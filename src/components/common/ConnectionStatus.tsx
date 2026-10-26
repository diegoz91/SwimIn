import React, { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';

/** Evento lanciato quando la rete torna: chi mostra dati in tempo reale ricarica (vedi useSignal). */
export const RECONNECTED_EVENT = 'swimin:reconnected';

/**
 * Avviso discreto sulla connessione: "Sei offline" finché manca la rete, "Di nuovo online"
 * per un attimo quando torna (e le pagine aperte si riallineano da sole).
 */
export const ConnectionStatus: React.FC = () => {
    const [state, setState] = useState<'online' | 'offline' | 'back'>(() => (typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'online'));

    useEffect(() => {
        let t = 0;
        const off = () => { window.clearTimeout(t); setState('offline'); };
        const on = () => {
            setState('back');
            window.dispatchEvent(new Event(RECONNECTED_EVENT));
            t = window.setTimeout(() => setState('online'), 2500);
        };
        window.addEventListener('offline', off);
        window.addEventListener('online', on);
        return () => { window.removeEventListener('offline', off); window.removeEventListener('online', on); window.clearTimeout(t); };
    }, []);

    if (state === 'online') return null;
    return (
        <div className="fixed inset-x-0 z-[110] flex justify-center px-4 pointer-events-none" style={{ top: 'calc(env(safe-area-inset-top) + 4.5rem)' }}>
            <p
                role="status"
                className={`pointer-events-auto inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold shadow-lift animate-in fade-in slide-in-from-top-2 duration-200 ${
                    state === 'offline' ? 'bg-abisso text-white' : 'bg-cloro-700 text-white'
                }`}
            >
                <Icon type={state === 'offline' ? 'alert-triangle' : 'check-circle'} className="w-4 h-4" />
                {state === 'offline' ? 'Sei offline: ti ricolleghiamo appena torna la rete.' : 'Di nuovo online: tutto aggiornato.'}
            </p>
        </div>
    );
};
