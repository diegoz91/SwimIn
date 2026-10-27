import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { rememberPendingJob } from '@/utils/pendingJob';
import { useAuth, type RegistrationData } from '@/hooks/useAuth';
import { useToast } from '@/context/ToastContext';
import { AccountTypePicker, initialChoice, registrationOf, type AccountChoice } from './AccountTypePicker';
import { AuthDivider, GoogleButton } from './GoogleButton';
import { authErrorMessage } from '@/utils/authErrors';
import { Checkbox, Field, fieldClass } from '@/components/form/Field';
import { PasswordMeter } from '@/components/form/PasswordMeter';
import { useForm, type FormErrors } from '@/hooks/useForm';
import { check, email as emailRule, maxLength, minLength, passwordStrength, personName, required } from '@/utils/validation';

type AccountType = RegistrationData['userType'];

type Values = { firstName: string; lastName: string; structureName: string; email: string; password: string; acceptedTerms: boolean };

const makeValidator = (userType: AccountType) => (v: Values): FormErrors<Values> => ({
    ...(userType === 'professional'
        ? {
              firstName: check(v.firstName, required('Indica il nome.'), minLength(2), maxLength(50), personName),
              lastName: check(v.lastName, required('Indica il cognome.'), minLength(2), maxLength(50), personName),
          }
        : { structureName: check(v.structureName, required('Indica il nome della struttura.'), minLength(2), maxLength(120)) }),
    email: check(v.email, required('Indica la tua email.'), emailRule),
    password:
        check(v.password, required('Scegli una password.')) ||
        (passwordStrength(v.password, [v.firstName, v.lastName, v.email.split('@')[0]]).score < 1
            ? passwordStrength(v.password, [v.firstName, v.lastName, v.email.split('@')[0]]).hint || 'Password troppo debole.'
            : undefined),
    acceptedTerms: v.acceptedTerms ? undefined : 'Per creare l’account devi accettare Termini e Privacy Policy.',
});

export const RegisterForm: React.FC = () => {
    const [params] = useSearchParams();
    useEffect(() => rememberPendingJob(params.get('offerta')), [params]);
    const [choice, setChoice] = useState<AccountChoice>(initialChoice(params.get('tipo')));
    const userType: AccountType = choice === 'struttura' ? 'structure' : 'professional';
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const validate = useCallback((v: Values) => makeValidator(userType)(v), [userType]);
    const form = useForm<Values>({ firstName: '', lastName: '', structureName: '', email: '', password: '', acceptedTerms: false }, validate);
    const { values, errors, bind } = form;

    const { register, isLoading } = useAuth();
    const { showToast } = useToast();
    const navigate = useNavigate();

    const handleSubmit = form.handleSubmit(async (v) => {
        setError(null);
        try {
            await register(v.email.trim().toLowerCase(), v.password, { ...registrationOf(choice, v), acceptedTerms: v.acceptedTerms });
            showToast('Account creato. Benvenuto in SwimIn!', 'success');
            navigate('/benvenuto', { replace: true });
        } catch (err) {
            setError(authErrorMessage(err, 'Registrazione non riuscita. Controlla i dati e riprova.'));
        }
    });

    return (
        <div className="w-full bg-white lg:rounded-3xl lg:shadow-lift lg:border lg:border-slate-100 lg:p-8 animate-in fade-in duration-300">
            <div className="text-center mb-6">
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Unisciti a SwimIn</h1>
                <p className="text-slate-500 mt-2">La community di chi vive il nuoto: per lavoro o per passione.</p>
            </div>

            <form ref={form.formRef} onSubmit={handleSubmit} className="space-y-5" noValidate>
                <AccountTypePicker value={choice} onChange={setChoice} disabled={isLoading} />

                <GoogleButton intent="register" choice={choice} disabled={isLoading} />
                <AuthDivider />

                {userType === 'professional' ? (
                    <div className="grid grid-cols-2 gap-3">
                        <Field id="firstName" label="Nome" error={errors.firstName}>
                            <input {...bind('firstName')} autoComplete="given-name" placeholder="Mario" disabled={isLoading} maxLength={60} />
                        </Field>
                        <Field id="lastName" label="Cognome" error={errors.lastName}>
                            <input {...bind('lastName')} autoComplete="family-name" placeholder="Rossi" disabled={isLoading} maxLength={60} />
                        </Field>
                    </div>
                ) : (
                    <Field id="structureName" label="Nome della struttura" error={errors.structureName}>
                        <input {...bind('structureName')} autoComplete="organization" placeholder="Es. Piscina comunale di Segrate" disabled={isLoading} maxLength={130} />
                    </Field>
                )}

                <Field id="email" label="Email" error={errors.email}>
                    <input {...bind('email')} type="email" inputMode="email" autoComplete="email" placeholder="nome@esempio.com" disabled={isLoading} autoCapitalize="none" spellCheck={false} />
                </Field>

                <div>
                    <Field
                        id="password"
                        label="Password"
                        error={errors.password}
                        trailing={
                            <button
                                type="button"
                                onClick={() => setShowPassword((v) => !v)}
                                className="text-xs font-bold text-slate-500 hover:text-slate-800 px-2 py-1 rounded-lg"
                                aria-label={showPassword ? 'Nascondi password' : 'Mostra password'}
                            >
                                {showPassword ? 'Nascondi' : 'Mostra'}
                            </button>
                        }
                    >
                        <input
                            {...bind('password')}
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="new-password"
                            className={fieldClass(errors.password, 'pr-24')}
                            placeholder="Almeno 8 caratteri"
                            disabled={isLoading}
                        />
                    </Field>
                    {!errors.password && <PasswordMeter password={values.password} personal={[values.firstName, values.lastName, values.email.split('@')[0]]} />}
                </div>

                <div>
                    <Checkbox
                        id="accept-terms"
                        checked={values.acceptedTerms}
                        onChange={(c) => form.set('acceptedTerms', c)}
                        disabled={isLoading}
                        invalid={!!errors.acceptedTerms}
                        label={
                            <span className="font-normal text-slate-600">
                                Ho almeno 16 anni, ho letto e accetto i{' '}
                                <Link to="/termini" target="_blank" className="text-corsia-700 font-semibold underline underline-offset-2">Termini di servizio</Link>{' '}
                                e la{' '}
                                <Link to="/privacy" target="_blank" className="text-corsia-700 font-semibold underline underline-offset-2">Privacy Policy</Link>.
                            </span>
                        }
                    />
                    {errors.acceptedTerms && <p className="mt-1.5 text-sm text-galleggiante-700">{errors.acceptedTerms}</p>}
                </div>

                {error && (
                    <p role="alert" className="text-sm font-medium text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                        {error}
                    </p>
                )}

                <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-4 rounded-full transition-all flex justify-center items-center gap-2 disabled:opacity-70 active:scale-[0.98] outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
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
