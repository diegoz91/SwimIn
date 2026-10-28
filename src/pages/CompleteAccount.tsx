import React, { useCallback, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/context/ToastContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { PageLoader } from '@/components/common/PageLoader';
import { Checkbox, Field } from '@/components/form/Field';
import { useForm, type FormErrors } from '@/hooks/useForm';
import { check, maxLength, minLength, personName, required } from '@/utils/validation';
import { AccountTypePicker, initialChoice, registrationOf, type AccountChoice } from '@/features/auth/components/AccountTypePicker';
import { InviteField, useInvite } from '@/features/auth/components/InviteField';
import { clearInvite } from '@/utils/invite';

type Values = { firstName: string; lastName: string; structureName: string; acceptedTerms: boolean };

/**
 * Primo accesso con Google: l'account esiste (email già verificata da Google) ma manca il profilo.
 * Si sceglie il tipo di account, si controlla il nome e si accettano i termini.
 */
const CompleteAccount: React.FC = () => {
    usePageTitle('Completa l’iscrizione');
    const { incompleteAccount, authenticated, isInitializing, completeAccount, isLoading, logout } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const fromState = (location.state || {}) as { choice?: AccountChoice; returnTo?: string };
    const [choice, setChoice] = useState<AccountChoice>(initialChoice(fromState.choice));
    const [error, setError] = useState<string | null>(null);
    const invite = useInvite();

    const [first = '', ...rest] = (incompleteAccount?.name || '').trim().split(/\s+/);
    const validate = useCallback(
        (v: Values): FormErrors<Values> => ({
            ...(choice === 'struttura'
                ? { structureName: check(v.structureName, required('Indica il nome della struttura.'), minLength(2), maxLength(120)) }
                : {
                      firstName: check(v.firstName, required('Indica il nome.'), minLength(2), maxLength(50), personName),
                      lastName: check(v.lastName, required('Indica il cognome.'), minLength(2), maxLength(50), personName),
                  }),
            acceptedTerms: v.acceptedTerms ? undefined : 'Per creare l’account devi accettare Termini e Privacy Policy.',
        }),
        [choice]
    );
    const form = useForm<Values>({ firstName: first, lastName: rest.join(' '), structureName: '', acceptedTerms: false }, validate);
    const { values, errors, bind } = form;

    const submit = form.handleSubmit(async (v) => {
        setError(null);
        if (!(await invite.verify())) {
            document.getElementById('invite-code')?.focus();
            return;
        }
        try {
            await completeAccount({ ...registrationOf(choice, v), acceptedTerms: v.acceptedTerms, inviteCode: invite.code || undefined });
            clearInvite();
            showToast('Account creato. Benvenuto in SwimIn!', 'success');
            navigate('/benvenuto', { replace: true });
        } catch (err) {
            console.error('Completamento account:', err);
            setError(err instanceof Error && err.message ? err.message : 'Non è stato possibile creare il profilo. Riprova.');
        }
    });

    if (isInitializing) return <PageLoader />;
    if (authenticated) return <Navigate to={fromState.returnTo || '/'} replace />;
    if (!incompleteAccount) return <Navigate to="/login" replace />;

    return (
        <AuthLayout aside={{ title: 'Ci sei quasi.', text: 'Dicci chi sei: ti mostreremo offerte, persone e strutture giuste per te.' }}>
            <div className="w-full bg-white lg:rounded-3xl lg:shadow-lift lg:border lg:border-slate-100 lg:p-8">
                <div className="text-center mb-6">
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Completa l’iscrizione</h1>
                    <p className="text-slate-500 mt-2 break-words">
                        Accesso con Google come <span className="font-semibold text-abisso">{incompleteAccount.email}</span>
                    </p>
                </div>
                <form ref={form.formRef} onSubmit={submit} className="space-y-5" noValidate>
                    <InviteField invite={invite} disabled={isLoading} />
                    <AccountTypePicker value={choice} onChange={setChoice} disabled={isLoading} legend="Sono qui perché" />
                    {choice === 'struttura' ? (
                        <Field id="structureName" label="Nome della struttura" error={errors.structureName}>
                            <input {...bind('structureName')} autoComplete="organization" placeholder="Es. Piscina comunale di Segrate" disabled={isLoading} maxLength={130} />
                        </Field>
                    ) : (
                        <div className="grid grid-cols-2 gap-3">
                            <Field id="firstName" label="Nome" error={errors.firstName}>
                                <input {...bind('firstName')} autoComplete="given-name" disabled={isLoading} maxLength={60} />
                            </Field>
                            <Field id="lastName" label="Cognome" error={errors.lastName}>
                                <input {...bind('lastName')} autoComplete="family-name" disabled={isLoading} maxLength={60} />
                            </Field>
                        </div>
                    )}
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
                                    <Link to="/termini" target="_blank" className="text-corsia-700 font-semibold underline underline-offset-2">Termini di servizio</Link> e la{' '}
                                    <Link to="/privacy" target="_blank" className="text-corsia-700 font-semibold underline underline-offset-2">Privacy Policy</Link>.
                                </span>
                            }
                        />
                        {errors.acceptedTerms && <p className="mt-1.5 text-sm text-galleggiante-700">{errors.acceptedTerms}</p>}
                    </div>
                    {error && <p role="alert" className="text-sm font-medium text-galleggiante-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>}
                    <button type="submit" disabled={isLoading} className="w-full bg-corsia-600 hover:bg-corsia-700 text-white font-bold py-3.5 px-4 rounded-full disabled:opacity-70 outline-hidden focus-visible:ring-2 focus-visible:ring-corsia-500 focus-visible:ring-offset-2">
                        {isLoading ? 'Creazione in corso…' : 'Crea il mio profilo'}
                    </button>
                </form>
                <div className="mt-6 text-center border-t border-slate-100 pt-6">
                    <button type="button" onClick={() => void logout().then(() => navigate('/login', { replace: true }))} className="py-1 -my-1 text-sm font-semibold text-slate-600 hover:text-abisso">
                        Non sei tu? Esci e usa un altro account
                    </button>
                </div>
            </div>
        </AuthLayout>
    );
};

export default CompleteAccount;
