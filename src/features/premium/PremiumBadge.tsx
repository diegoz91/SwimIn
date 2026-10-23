import React from 'react';

/**
 * Bollino di SwimIn Premium: una piccola medaglia d'oro con la "T" di fine corsia.
 * `size="sm"` accanto ai nomi nelle liste, `md` accanto al nome del profilo.
 */
export const PremiumBadge: React.FC<{ size?: 'sm' | 'md'; label?: boolean; className?: string }> = ({ size = 'sm', label = false, className = '' }) => {
    const box = size === 'md' ? 'w-6 h-6' : 'w-4 h-4';
    return (
        <span className={`inline-flex items-center gap-1 align-middle flex-shrink-0 ${className}`} title="SwimIn Premium">
            <svg viewBox="0 0 24 24" className={box} aria-hidden="true">
                <defs>
                    <linearGradient id="swimin-oro" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stopColor="#E0C277" />
                        <stop offset="1" stopColor="#9A7022" />
                    </linearGradient>
                </defs>
                <rect x="1" y="1" width="22" height="22" rx="7" fill="url(#swimin-oro)" />
                <rect x="6.5" y="6" width="11" height="3" rx="1.5" fill="#fff" />
                <rect x="10.5" y="6" width="3" height="10" rx="1.5" fill="#fff" />
                <path d="M5 18.5c1.2-.9 2.3-.9 3.5 0s2.3.9 3.5 0 2.3-.9 3.5 0 2.3.9 3.5 0" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            {label ? <span className="text-xs font-semibold text-oro-700">Premium</span> : <span className="sr-only">Premium</span>}
        </span>
    );
};
