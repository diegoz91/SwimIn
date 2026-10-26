import React, { useState } from 'react';
import googleG from '@/assets/google-g.svg';
import { googleAuthEnabled, startGoogle, type GoogleReturn } from '@/services/google';

/**
 * "Continua con Google" secondo le linee guida di Google (sfondo chiaro, logo G, bordo).
 * Porta su Google; al ritorno /accesso/google apre la sessione o chiede di completare l'iscrizione.
 */
export const GoogleButton: React.FC<{ intent: 'login' | 'register'; returnTo?: string; choice?: GoogleReturn['choice']; disabled?: boolean }> = ({ intent, returnTo, choice, disabled }) => {
    const [going, setGoing] = useState(false);
    if (!googleAuthEnabled) return null;
    return (
        <button
            type="button"
            disabled={disabled || going}
            onClick={() => {
                setGoing(true);
                startGoogle({ intent, returnTo, choice });
            }}
            className="w-full flex items-center justify-center gap-3 bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 text-slate-800 font-semibold py-3 px-4 rounded-xl transition-colors disabled:opacity-60 outline-none focus-visible:ring-2 focus-visible:ring-corsia-500 focus-visible:ring-offset-2"
        >
            {going ? <span className="w-5 h-5 border-2 border-slate-300 border-t-corsia-600 rounded-full animate-spin" aria-hidden="true" /> : <img src={googleG} alt="" className="w-5 h-5" />}
            {going ? 'Apertura di Google…' : intent === 'register' ? 'Iscriviti con Google' : 'Continua con Google'}
        </button>
    );
};

/** Separatore "oppure" tra Google ed email; non compare se l'accesso con Google è spento. */
export const AuthDivider: React.FC<{ label?: string; className?: string }> = ({ label = 'oppure con la tua email', className = '' }) =>
    googleAuthEnabled ? (
        <div className={`flex items-center gap-3 ${className}`} role="separator" aria-label={label}>
            <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
            <span className="text-xs font-semibold text-slate-500" aria-hidden="true">{label}</span>
            <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
        </div>
    ) : null;
