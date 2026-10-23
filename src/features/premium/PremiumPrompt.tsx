import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { onPremiumRequest, type PremiumRequest } from '@/services/premiumPrompt';
import { PremiumBadge } from './PremiumBadge';

/** Finestra "Passa a Premium", aperta da qualsiasi azione riservata ai Premium. */
export const PremiumPrompt: React.FC = () => {
    const navigate = useNavigate();
    const [req, setReq] = useState<PremiumRequest | null>(null);
    const ctaRef = useRef<HTMLButtonElement>(null);

    useEffect(() => onPremiumRequest(setReq), []);
    useEffect(() => {
        if (!req) return;
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setReq(null);
        document.addEventListener('keydown', onKey);
        window.setTimeout(() => ctaRef.current?.focus(), 0);
        return () => document.removeEventListener('keydown', onKey);
    }, [req]);

    if (!req) return null;
    const exhausted = req.code === 'inmail_exhausted';
    return createPortal(
        <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center bg-abisso/50 backdrop-blur-sm animate-in fade-in duration-150" onMouseDown={(e) => e.target === e.currentTarget && setReq(null)}>
            <div role="dialog" aria-modal="true" aria-labelledby="premium-prompt-title" className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-lift overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200 motion-reduce:animate-none">
                <div className="bg-gradient-to-br from-oro-50 to-white px-6 pt-6 pb-4 border-b border-oro-100">
                    <div className="flex items-start justify-between gap-3">
                        <PremiumBadge size="md" />
                        <button onClick={() => setReq(null)} aria-label="Chiudi" className="p-2 -m-2 rounded-full text-slate-500 hover:bg-white">
                            <Icon type="x" className="w-5 h-5" />
                        </button>
                    </div>
                    <h2 id="premium-prompt-title" className="text-3xl font-bold text-abisso mt-3 leading-tight">
                        {exhausted ? 'Messaggi diretti esauriti' : 'Disponibile con Premium'}
                    </h2>
                    <p className="text-slate-700 mt-2">{req.message}</p>
                </div>
                <div className="px-6 py-5 flex flex-col sm:flex-row gap-2 sm:justify-end">
                    <button onClick={() => setReq(null)} className="px-5 py-2.5 rounded-full font-semibold text-slate-600 hover:bg-slate-100">Non ora</button>
                    {!exhausted && (
                        <button ref={ctaRef} onClick={() => { setReq(null); navigate('/premium'); }} className="px-5 py-2.5 rounded-full font-semibold bg-abisso text-white hover:bg-corsia-900">
                            Scopri SwimIn Premium
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};
