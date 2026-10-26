import React from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconType } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger' | 'dark';
export type ButtonSize = 'sm' | 'md';

const VARIANTS: Record<ButtonVariant, string> = {
    primary: 'bg-corsia-600 text-white hover:bg-corsia-700',
    secondary: 'bg-white border border-slate-300 text-abisso hover:bg-slate-50 hover:border-slate-400',
    quiet: 'text-corsia-700 hover:bg-corsia-50',
    danger: 'text-galleggiante-700 hover:bg-red-50',
    dark: 'bg-abisso text-white hover:bg-corsia-900',
};
const SIZES: Record<ButtonSize, string> = {
    sm: 'px-3.5 py-1.5 text-sm gap-1.5',
    md: 'px-4 py-2.5 text-sm gap-2',
};

/** Classi del pulsante standard di SwimIn (per i casi in cui serve solo la classe). */
export const buttonClass = (variant: ButtonVariant = 'primary', size: ButtonSize = 'md', extra = '') =>
    `inline-flex items-center justify-center rounded-full font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-corsia-500 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${extra}`;

type ButtonProps = {
    variant?: ButtonVariant;
    size?: ButtonSize;
    icon?: IconType;
    busy?: boolean;
    className?: string;
    /** Con `to` il pulsante è un link interno. */
    to?: string;
    children?: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'>;

/**
 * Pulsante unico dell'app: pillola, sentence case, colori dei token. Con `to` diventa un link.
 * `busy` mostra la rotellina e disattiva il pulsante.
 */
export const Button: React.FC<ButtonProps> = ({ variant = 'primary', size = 'md', icon, busy, children, className = '', to, type = 'button', disabled, ...rest }) => {
    const content = (
        <>
            {busy ? (
                <span className={`w-4 h-4 border-2 rounded-full animate-spin ${variant === 'primary' || variant === 'dark' ? 'border-white/40 border-t-white' : 'border-slate-300 border-t-corsia-600'}`} aria-hidden="true" />
            ) : icon ? (
                <Icon type={icon} className="w-4 h-4" />
            ) : null}
            {children}
        </>
    );
    if (to) {
        return <Link to={to} className={buttonClass(variant, size, className)} aria-label={rest['aria-label']}>{content}</Link>;
    }
    return (
        <button type={type} disabled={disabled || busy} aria-busy={busy || undefined} {...rest} className={buttonClass(variant, size, className)}>
            {content}
        </button>
    );
};
