import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useBlocks } from '@/context/BlocksContext';
import { ReportModal } from './ReportModal';

/** Menu "…" sul profilo di un'altra persona o struttura: silenzia, blocca, segnala. */
export const ProfileActionsMenu: React.FC<{ userId: string; name: string; targetType?: 'profile' | 'facility' }> = ({ userId, name, targetType = 'profile' }) => {
    const { blocked, muted, block, unblock } = useBlocks();
    const [open, setOpen] = useState(false);
    const [reporting, setReporting] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const isBlocked = blocked.includes(userId);
    const isMuted = muted.includes(userId);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
        document.addEventListener('pointerdown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const item = 'w-full text-left flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-piastrella outline-none focus-visible:bg-piastrella';
    return (
        <div ref={ref} className="relative flex-shrink-0" data-html2canvas-ignore="true">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label="Altre azioni"
                className="p-2.5 rounded-full text-slate-500 hover:text-abisso hover:bg-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-corsia-500"
            >
                <Icon type="ellipsis" className="w-5 h-5" />
            </button>
            {open && (
                <div role="menu" className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl border border-slate-200 shadow-lift py-1.5 z-30 animate-in fade-in slide-in-from-top-1 duration-150">
                    {targetType === 'profile' && (
                        <button role="menuitem" className={`${item} text-abisso`} onClick={async () => { setOpen(false); await (isMuted ? unblock(userId, 'mute') : block(userId, 'mute')); }}>
                            <Icon type="bell" className="w-5 h-5 text-slate-400" />
                            {isMuted ? `Mostra di nuovo i post di ${name}` : `Silenzia ${name}`}
                        </button>
                    )}
                    {targetType === 'profile' && (
                        <button
                            role="menuitem"
                            className={`${item} text-galleggiante`}
                            onClick={async () => {
                                setOpen(false);
                                if (isBlocked) await unblock(userId);
                                else if (window.confirm(`Bloccare ${name}? Non potrà più scriverti, collegarsi con te o commentare i tuoi post, e il collegamento verrà rimosso.`)) await block(userId);
                            }}
                        >
                            <Icon type="user-minus" className="w-5 h-5" /> {isBlocked ? 'Sblocca' : 'Blocca'}
                        </button>
                    )}
                    <button role="menuitem" className={`${item} text-abisso`} onClick={() => { setOpen(false); setReporting(true); }}>
                        <Icon type="alert-triangle" className="w-5 h-5 text-slate-400" /> Segnala
                    </button>
                </div>
            )}
            {reporting && <ReportModal targetType={targetType} targetId={userId} onClose={() => setReporting(false)} />}
        </div>
    );
};
