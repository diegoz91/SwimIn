import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, type RegistrationData } from '@/hooks/useAuth';
import { useToast } from '@/context/ToastContext';
import { Icon } from '@/components/ui/Icon';
import { authErrorMessage } from '@/utils/authErrors';

type AccountType = RegistrationData['userType'];

const inputClass =
    'w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none bg-slate-50 focus:bg-white disabled:opacity-60';

const ACCOUNT_TYPES: { id: AccountType; title: string; description: string; icon: 'user' | 'building' }[] = [
    { id: 'professional', title: 'Professionista', description: 'Istruttore, assistente bagnanti, allenatore…', icon: 'user' },
    { id: 'structure', title: 'Struttura', description: 'Piscina, centro sportivo, società', icon: 'building' },
];

export const RegisterForm: React.FC = () => {
    const [params] = useSearchParams();
    const [userType, setUserType] = useState<AccountType>(params.get('tipo') === 'struttura' ? 'structure' : 'professional');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [structureName, setStructureName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { register, isLoading } = useAuth();
    const { showToast } = useToast();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (password.length < 8) {
            setError('La password deve contenere almeno 8 caratteri.');
            return;
        }
        if (!acceptedTerms) {
            setError('Per creare l\'account devi accettare Termini e Privacy Policy.');
            return;
        }

        try {
            await register(email.trim(), password, { userType, firstName, lastName, structureName });
            showToast('Account creato! Benvenuto in SwimIn 🌊', 'success');
            navigate('/benvenuto', { replace: true });
        } catch (err) {
            setError(authErrorMessage(err, 'Registrazione non riuscita. Controlla i dati e riprova.'));
        }
    };

    return (
        <div className="w-full bg-white lg:rounded-3xl lg:shadow-lift lg:border lg:border-slate-100 lg:p-8 animate-in fade-in duration-300">
            <div className="text-center mb-6">
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Unisciti a SwimIn</h1>
                <p className="text-slate-500 mt-2">Il network professionale del mondo del nuoto.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5" noValidate={false}>
                <fieldset>
                    <legend className="block text-sm font-semibold text-slate-700 mb-2">Mi iscrivo come</legend>
                    <div className="grid grid-cols-2 gap-3" role="radiogroup">
                        {ACCOUNT_TYPES.map((t) => {
                            const selected = userType === t.id;
                            return (
                                <button
                                    key={t.id}
                                    type="button"
                                    role="radio"
                                    aria-checked={selected}
                                    onClick={() => setUserType(t.id)}
                                    disabled={isLoading}
                                    className={`text-left p-3 rounded-2xl border-2 transition-all outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                                        selected ? 'border-blue-600 bg-blue-50' : 'border-slate-200 hover:border-slate-300 bg-white'
                                    }`}
                                >
                                    <Icon type={t.icon} className={`w-6 h-6 mb-1 ${selected ? 'text-blue-600' : 'text-slate-400'}`} />
                                    <span className={`block font-bold text-sm ${selected ? 'text-blue-800' : 'text-slate-800'}`}>{t.title}</span>
                                    <span className="block text-[11px] leading-tight text-slate-500 mt-0.5">{t.description}</span>
                                </button>
                            );
                        })}
                    </div>
                </fieldset>

                {userType === 'professional' ? (
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5" htmlFor="firstName">Nome</label>
                            <input id="firstName" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} placeholder="Mario" disabled={isLoading} required maxLength={100} />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5" htmlFor="lastName">Cognome</label>
                            <input id="lastName" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} placeholder="Rossi" disabled={isLoading} required maxLength={100} />
                        </div>
                    </div>
                ) : (
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5" htmlFor="structureName">Nome della struttura</label>
                        <input id="structureName" autoComplete="organization" value={structureName} onChange={(e) => setStructureName(e.target.value)} className={inputClass} placeholder="Es. Piscina Comunale di Segrate" disabled={isLoading} required maxLength={200} />
                    </div>
                )}

                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5" htmlFor="email">Email</label>
                    <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="nome@esempio.com" disabled={isLoading} required />
                </div>

                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5" htmlFor="password">Password</label>
                    <div className="relative">
                        <input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="new-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className={`${inputClass} pr-20`}
                            placeholder="Minimo 8 caratteri"
                            minLength={8}
                            disabled={isLoading}
                            required
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500 hover:text-slate-800 px-2 py-1 rounded-lg"
                            aria-label={showPassword ? 'Nascondi password' : 'Mostra password'}
                        >
                            {showPassword ? 'Nascondi' : 'Mostra'}
                        </button>
                    </div>
                </div>

                <label className="flex items-start gap-3 text-sm text-slate-600 cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={acceptedTerms}
                        onChange={(e) => setAcceptedTerms(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        disabled={isLoading}
                        required
                    />
                    <span>
                        Ho letto e accetto i{' '}
                        <Link to="/termini" target="_blank" className="text-blue-600 font-semibold hover:underline">Termini di servizio</Link>{' '}
                        e la{' '}
                        <Link to="/privacy" target="_blank" className="text-blue-600 font-semibold hover:underline">Privacy Policy</Link>.
                    </span>
                </label>

                {error && (
                    <p role="alert" className="text-sm font-medium text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                        {error}
                    </p>
                )}

                <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-4 rounded-xl transition-all shadow-md flex justify-center items-center gap-2 disabled:opacity-70 active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                >
                    {isLoading ? (
                        <>
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>Creazione in corso…</span>
                        </>
                    ) : (
                        'Crea account'
                    )}
                </button>
            </form>

            <div className="mt-6 text-center border-t border-slate-100 pt-6">
                <p className="text-slate-600">
                    Hai già un account?{' '}
                    <Link to="/login" className="text-blue-600 font-bold hover:text-blue-800 transition-colors">
                        Accedi
                    </Link>
                </p>
            </div>
        </div>
    );
};
