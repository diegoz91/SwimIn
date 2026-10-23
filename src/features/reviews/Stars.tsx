import React, { useState } from 'react';

const STAR = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z';

/** Stelle in sola lettura, anche frazionarie (es. 4,3). */
export const Stars: React.FC<{ value: number; size?: 'sm' | 'md' | 'lg'; className?: string }> = ({ value, size = 'sm', className = '' }) => {
    const px = size === 'lg' ? 'w-6 h-6' : size === 'md' ? 'w-5 h-5' : 'w-4 h-4';
    return (
        <span className={`inline-flex items-center gap-0.5 ${className}`} role="img" aria-label={`${value.toLocaleString('it-IT', { maximumFractionDigits: 1 })} stelle su 5`}>
            {[1, 2, 3, 4, 5].map((i) => {
                const fill = Math.max(0, Math.min(1, value - (i - 1)));
                return (
                    <span key={i} className={`relative ${px}`} aria-hidden="true">
                        <svg viewBox="0 0 24 24" className={`absolute inset-0 ${px} text-slate-200`} fill="currentColor"><path d={STAR} /></svg>
                        <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                            <svg viewBox="0 0 24 24" className={`${px} text-amber-400`} fill="currentColor"><path d={STAR} /></svg>
                        </span>
                    </span>
                );
            })}
        </span>
    );
};

const LABELS = ['', 'Pessima', 'Scarsa', 'Nella media', 'Buona', 'Eccellente'];

/** Voto da 1 a 5: radio accessibili con tastiera (frecce) e anteprima al passaggio. */
export const StarInput: React.FC<{ value: number; onChange: (v: number) => void; id?: string; invalid?: boolean }> = ({ value, onChange, id, invalid }) => {
    const [hover, setHover] = useState(0);
    const shown = hover || value;
    return (
        <div className="flex items-center gap-3">
            <div id={id} role="radiogroup" aria-label="Voto" aria-invalid={invalid ? 'true' : undefined} className="flex gap-1" onPointerLeave={() => setHover(0)}>
                {[1, 2, 3, 4, 5].map((i) => (
                    <button
                        key={i}
                        type="button"
                        role="radio"
                        aria-checked={value === i}
                        aria-label={`${i} ${i === 1 ? 'stella' : 'stelle'}: ${LABELS[i].toLowerCase()}`}
                        tabIndex={value ? (value === i ? 0 : -1) : i === 1 ? 0 : -1}
                        onPointerEnter={() => setHover(i)}
                        onClick={() => onChange(i)}
                        onKeyDown={(e) => {
                            let next = 0;
                            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(5, (value || 0) + 1);
                            if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(1, (value || 2) - 1);
                            if (!next) return;
                            e.preventDefault();
                            onChange(next);
                            (e.currentTarget.parentElement?.children[next - 1] as HTMLElement | undefined)?.focus();
                        }}
                        className="p-0.5 rounded-md outline-none focus-visible:ring-4 focus-visible:ring-corsia-100 transition-transform active:scale-90"
                    >
                        <svg viewBox="0 0 24 24" className={`w-9 h-9 transition-colors ${i <= shown ? 'text-amber-400' : invalid ? 'text-red-200' : 'text-slate-200'}`} fill="currentColor" aria-hidden="true">
                            <path d={STAR} />
                        </svg>
                    </button>
                ))}
            </div>
            <span className="text-sm font-semibold text-abisso min-w-[6rem]" aria-live="polite">{LABELS[shown] || ''}</span>
        </div>
    );
};
