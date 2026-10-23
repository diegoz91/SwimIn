import React, { useEffect, useState } from 'react';

/** Anello di avanzamento che si riempie all'apertura (rispetta "riduci movimento"). */
export const CompletionRing: React.FC<{ value: number; size?: number }> = ({ value, size = 88 }) => {
    const [shown, setShown] = useState(0);
    const stroke = 8;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;

    useEffect(() => {
        const t = window.requestAnimationFrame(() => setShown(Math.max(0, Math.min(100, value))));
        return () => window.cancelAnimationFrame(t);
    }, [value]);

    return (
        <div className="relative flex-shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Profilo completo al ${value}%`}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E6F2F6" strokeWidth={stroke} />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    stroke="url(#ring-gradient)"
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={c}
                    strokeDashoffset={c * (1 - shown / 100)}
                    className="transition-[stroke-dashoffset] duration-1000 ease-out motion-reduce:transition-none"
                />
                <defs>
                    <linearGradient id="ring-gradient" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#0E6A97" />
                        <stop offset="100%" stopColor="#12B5AE" />
                    </linearGradient>
                </defs>
            </svg>
            <span className="absolute inset-0 grid place-items-center font-display text-2xl font-bold text-abisso">{value}%</span>
        </div>
    );
};
