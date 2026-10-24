import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/context/ToastContext';
import { Icon } from '@/components/ui/Icon';
import { account } from '@/services/appwrite';
import { authErrorMessage } from '@/utils/authErrors';

export const LoginForm: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    
    const [showRecovery, setShowRecovery] = useState(false);
    const [recoveryEmail, setRecoveryEmail] = useState('');
    const [isRecovering, setIsRecovering] = useState(false);

    const { login, completeMfa, isLoading } = useAuth();
    // Verifica in due passaggi: dopo la password chiediamo il codice dell'app (o un codice di recupero).
    const [mfaStep, setMfaStep] = useState(false);
    const [mfaCode, setMfaCode] = useState('');
    const [useRecoveryCode, setUseRecoveryCode] = useState(false);
    const { showToast } = useToast();
    const navigate = useNavigate();
    const location = useLocation();

    const from = (location.state?.from?.pathname || '/') + (location.state?.from?.search || '');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!email || !password) {
            showToast('Inserisci email e password per continuare.', 'error');
            return;
        }

        try {
            const result = await login(email, password);
            if (result === 'mfa') {
                setMfaStep(true);
                return;
            }
            showToast('Accesso effettuato.', 'success');
            navigate(from, { replace: true });
        } catch (err: any) {
            showToast(authErrorMessage(err, 'Accesso non riuscito. Riprova.'), 'error');
        }
    };

    const handleMfa = async (e: React.FormEvent) => {
        e.preventDefault();
        const code = mfaCode.trim();
        if (!code) return showToast(useRecoveryCode ? 'Inserisci un codice di recupero.' : 'Inserisci il codice di 6 cifre dell’app.', 'error');
        try {
            await completeMfa(code, useRecoveryCode);
            showToast('Accesso effettuato.', 'success');
            navigate(from, { replace: true });
        } catch (err) {
            console.warn('Verifica in due passaggi:', err);
            showToast(useRecoveryCode ? 'Codice di recupero non valido o già usato.' : 'Codice non valido: controlla l’app e riprova.', 'error');
            setMfaCode('');
        }
    };

    const handlePasswordRecovery = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!recoveryEmail) {
            showToast('Inserisci la tua email per il recupero.', 'error');
            return;
        }

        setIsRecovering(true);
        try {
            const resetUrl = `${window.location.origin}/reset-password`;
            await account.createRecovery(recoveryEmail, resetUrl);
            
            showToast('Ti abbiamo inviato un link. Controlla la tua email.', 'success');
            
            setTimeout(() => {
                setShowRecovery(false);
                setRecoveryEmail('');
            }, 3000);

        } catch (err: any) {
            showToast('Errore. Assicurati che l\'email sia corretta e riprova.', 'error');
        } finally {
            setIsRecovering(false);
        }
    };

    return (
        <div className="w-full bg-white lg:rounded-3xl lg:shadow-lift lg:border lg:border-slate-100 lg:p-8 animate-in fade-in duration-300">
            <div className="text-center mb-8">
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Bentornato in SwimIn</h1>
                <p className="text-slate-500 mt-2">Accedi al tuo network professionale.</p>
            </div>

            {mfaStep ? (
                <form onSubmit={handleMfa} className="space-y-5">
                    <div className="rounded-2xl bg-piastrella p-4 flex gap-3">
                        <Icon type="shield" className="w-6 h-6 text-corsia-600 flex-shrink-0" />
                        <p className="text-sm text-slate-700">
                            {useRecoveryCode ? 'Inserisci uno dei codici di recupero che hai salvato quando hai attivato la verifica.' : 'Apri l’app di autenticazione sul telefono e scrivi il codice di 6 cifre per SwimIn.'}
                        </p>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5" htmlFor="mfa-code">{useRecoveryCode ? 'Codice di recupero' : 'Codice dell’app'}</label>
                        <input
                            id="mfa-code"
                            value={mfaCode}
                            onChange={(e) => setMfaCode(useRecoveryCode ? e.target.value.slice(0, 20) : e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
                            inputMode={useRecoveryCode ? 'text' : 'numeric'}
                            autoComplete="one-time-code"
                            autoFocus
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-slate-50 focus:bg-white text-lg tracking-[0.3em] tabular-nums"
                            placeholder={useRecoveryCode ? 'abcd1234ef' : '123456'}
                            disabled={isLoading}
                        />
                    </div>
                    <button type="submit" disabled={isLoading} className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl hover:bg-blue-700 disabled:opacity-60">
                        {isLoading ? 'Verifica…' : 'Accedi'}
                    </button>
                    <div className="flex flex-wrap justify-between gap-2 text-sm">
                        <button type="button" onClick={() => { setUseRecoveryCode((v) => !v); setMfaCode(''); }} className="py-1 font-semibold text-corsia-700 hover:underline">
                            {useRecoveryCode ? 'Usa il codice dell’app' : 'Non hai il telefono? Usa un codice di recupero'}
                        </button>
                        <button type="button" onClick={() => { setMfaStep(false); setMfaCode(''); setPassword(''); }} className="py-1 font-semibold text-slate-500 hover:text-abisso">Torna indietro</button>
                    </div>
                </form>
            ) : !showRecovery ? (
                <>
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5" htmlFor="email">Email</label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none bg-slate-50 focus:bg-white"
                                placeholder="nome@esempio.com"
                                disabled={isLoading}
                                required
                            />
                        </div>

                        <div>
                            <div className="flex justify-between items-center mb-1.5">
                                <label className="block text-sm font-semibold text-slate-700" htmlFor="password">Password</label>
                                <button 
                                    type="button" 
                                    onClick={() => setShowRecovery(true)}
                                    className="py-1 -my-1 text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                                >
                                    Password dimenticata?
                                </button>
                            </div>
                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none bg-slate-50 focus:bg-white"
                                placeholder="••••••••"
                                disabled={isLoading}
                                required
                            />
                        </div>

                        {/* LOGIN */}
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-4 rounded-xl transition-all shadow-md flex justify-center items-center gap-2 disabled:opacity-70 active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                        >
                            {isLoading ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    <span>Accesso in corso...</span>
                                </>
                            ) : (
                                'Accedi'
                            )}
                        </button>
                    </form>

                    <div className="mt-8 text-center border-t border-slate-100 pt-6">
                        <p className="text-slate-600">
                            Non hai ancora un account?{' '}
                            <Link to="/register" className="text-blue-600 font-bold hover:text-blue-800 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-200 rounded">
                                Iscriviti ora
                            </Link>
                        </p>
                    </div>
                </>
            ) : (
                <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="mb-6">
                        <button 
                            onClick={() => setShowRecovery(false)}
                            className="flex items-center text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors mb-4 outline-none focus-visible:ring-2 focus-visible:ring-slate-300 rounded pr-2"
                        >
                            <Icon type="arrow-left" className="w-4 h-4 mr-1" />
                            Torna all’accesso
                        </button>
                        <h2 className="text-xl font-bold text-slate-900">Recupera la password</h2>
                        <p className="text-sm text-slate-500 mt-1">Inserisci la tua email, ti invieremo le istruzioni.</p>
                    </div>

                    <form onSubmit={handlePasswordRecovery} className="space-y-5">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5" htmlFor="recoveryEmail">Email dell’account</label>
                            <input
                                id="recoveryEmail"
                                type="email"
                                value={recoveryEmail}
                                onChange={(e) => setRecoveryEmail(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none bg-slate-50 focus:bg-white"
                                placeholder="nome@esempio.com"
                                disabled={isRecovering}
                                required
                            />
                        </div>

                        {/* RECOVERY */}
                        <button
                            type="submit"
                            disabled={isRecovering}
                            className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3.5 px-4 rounded-xl transition-all shadow-md flex justify-center items-center gap-2 disabled:opacity-70 active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
                        >
                            {isRecovering ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    <span>Invio in corso...</span>
                                </>
                            ) : (
                                'Invia il link'
                            )}
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
};