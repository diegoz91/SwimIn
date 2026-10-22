import React from 'react';

interface BrandMarkProps {
    className?: string;
    /** Versione per sfondi scuri: piastrella chiara e T blu. */
    inverted?: boolean;
    title?: string;
}

/**
 * Marchio SwimIn: la "T" che segna la fine della corsia sul fondo della vasca,
 * su una piastrella, appoggiata a una linea d'acqua color cloro.
 */
export const BrandMark: React.FC<BrandMarkProps> = ({ className = 'w-9 h-9', inverted = false, title }) => (
    <svg
        viewBox="0 0 40 40"
        className={className}
        role={title ? 'img' : undefined}
        aria-hidden={title ? undefined : true}
        aria-label={title}
        xmlns="http://www.w3.org/2000/svg"
    >
        <rect width="40" height="40" rx="11" fill={inverted ? '#FFFFFF' : '#0E6A97'} />
        {/* T di fine corsia */}
        <rect x="10" y="9" width="20" height="5" rx="2.5" fill={inverted ? '#0E6A97' : '#FFFFFF'} />
        <rect x="17.5" y="9" width="5" height="18" rx="2.5" fill={inverted ? '#0E6A97' : '#FFFFFF'} />
        {/* linea d'acqua */}
        <path
            d="M7 30.5c2.2-1.6 4.4-1.6 6.6 0s4.4 1.6 6.6 0 4.4-1.6 6.6 0 4.4 1.6 6.6 0"
            fill="none"
            stroke="#33C6BD"
            strokeWidth="3"
            strokeLinecap="round"
        />
    </svg>
);

interface BrandProps {
    size?: 'sm' | 'md' | 'lg';
    inverted?: boolean;
    /** Mostra solo il marchio, senza scritta. */
    markOnly?: boolean;
    className?: string;
}

const SIZES = {
    sm: { mark: 'w-7 h-7', text: 'text-xl' },
    md: { mark: 'w-9 h-9', text: 'text-[1.65rem]' },
    lg: { mark: 'w-12 h-12', text: 'text-4xl' },
};

/** Logo completo: marchio + scritta "SwimIn" in Barlow Condensed. */
export const Brand: React.FC<BrandProps> = ({ size = 'md', inverted = false, markOnly = false, className = '' }) => (
    <span className={`inline-flex items-center gap-2 ${className}`}>
        <BrandMark className={SIZES[size].mark} inverted={inverted} title={markOnly ? 'SwimIn' : undefined} />
        {!markOnly && (
            <span className={`font-display font-bold leading-none tracking-tight ${SIZES[size].text} ${inverted ? 'text-white' : 'text-abisso'}`}>
                SwimIn
            </span>
        )}
    </span>
);
