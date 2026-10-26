import React, { useRef, useState } from 'react';
import { Icon, type IconType } from '@/components/ui/Icon';

/**
 * Riga che si trascina verso sinistra con il dito per un'azione rapida (es. "segna come letta").
 * Solo per il tocco: con mouse e tastiera c'è sempre anche un pulsante equivalente nella riga.
 */
export const SwipeAction: React.FC<{ enabled?: boolean; label: string; icon?: IconType; onAction: () => void; children: React.ReactNode }> = ({ enabled = true, label, icon = 'check', onAction, children }) => {
    const start = useRef<{ x: number; y: number; id: number } | null>(null);
    const [dx, setDx] = useState(0);
    const [done, setDone] = useState(false);
    const THRESHOLD = 88;

    const onPointerDown = (e: React.PointerEvent) => {
        if (!enabled || e.pointerType !== 'touch') return;
        start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    };
    const onPointerMove = (e: React.PointerEvent) => {
        const s = start.current;
        if (!s || s.id !== e.pointerId) return;
        const x = e.clientX - s.x;
        const y = e.clientY - s.y;
        // Scorrimento verticale della pagina: non è uno swipe.
        if (Math.abs(y) > Math.abs(x) && Math.abs(dx) < 8) { start.current = null; setDx(0); return; }
        setDx(Math.min(0, Math.max(-140, x)));
    };
    const end = () => {
        if (!start.current) return;
        start.current = null;
        if (dx <= -THRESHOLD) {
            setDone(true);
            setDx(-400);
            window.setTimeout(() => { onAction(); setDx(0); setDone(false); }, 180);
        } else setDx(0);
    };

    return (
        <div className="relative overflow-hidden">
            {dx < 0 && (
                <div className="absolute inset-0 flex items-center justify-end pr-5 bg-corsia-600 text-white text-sm font-semibold gap-2" aria-hidden="true">
                    <Icon type={icon} className="w-5 h-5" /> {label}
                </div>
            )}
            <div
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={end}
                onPointerCancel={end}
                className={`relative bg-white ${done || dx === 0 ? 'transition-transform duration-200' : ''}`}
                style={{ transform: `translateX(${dx}px)`, touchAction: 'pan-y' }}
            >
                {children}
            </div>
        </div>
    );
};
