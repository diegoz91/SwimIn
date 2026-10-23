import React from 'react';
import { passwordStrength } from '@/utils/validation';

const COLORS = ['bg-galleggiante', 'bg-orange-400', 'bg-amber-400', 'bg-cloro-500', 'bg-cloro-600'];

/** Barra a quattro tacche con giudizio e suggerimento sulla password. */
export const PasswordMeter: React.FC<{ password: string; personal?: string[]; id?: string }> = ({ password, personal = [], id }) => {
    if (!password) return null;
    const s = passwordStrength(password, personal);
    return (
        <div id={id} className="mt-2" aria-live="polite">
            <div className="flex gap-1" aria-hidden="true">
                {[1, 2, 3, 4].map((i) => (
                    <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${s.score >= i || (i === 1 && s.score === 0) ? COLORS[s.score] : 'bg-slate-200'}`} />
                ))}
            </div>
            <p className="text-xs mt-1.5 text-slate-600">
                <span className="font-semibold">{s.label}</span>
                {s.hint && <span className="text-slate-500"> · {s.hint}</span>}
            </p>
        </div>
    );
};
