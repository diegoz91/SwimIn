import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { account } from '@/services/appwrite';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/context/ToastContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Icon } from '@/components/ui/Icon';
import { calendarToken, insertCalendarEvents, takeGoogleReturn } from '@/services/google';

/**
 * Ritorno da Google (/accesso/google?userId=…&secret=…&state=…). Apre la sessione con il token
 * di Appwrite e decide dove andare: pagina richiesta, completamento dell'iscrizione, codice della
 * verifica in due passaggi; se era un collegamento del calendario salva subito gli eventi.
 */
const GoogleCallback: React.FC = () => {
    usePageTitle('Accesso con Google');
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const { reloadSession } = useAuth();
    const { showToast } = useToast();
    const [error, setError] = useState<string | null>(null);
    const started = useRef(false);

    useEffect(() => {
        if (started.current) return;
        started.current = true;
        void (async () => {
            const pending = takeGoogleReturn(params.get('state'));
            if (params.get('errore')) {
                setError('Google non ha completato l’accesso. Forse hai annullato o non hai concesso i permessi.');
                return;
            }
            if (!pending) {
                setError('Questo link di accesso non è più valido. Riprova da SwimIn.');
                return;
            }
            const userId = params.get('userId');
            const secret = params.get('secret');
            const linking = pending.intent === 'calendar' || pending.intent === 'link';
            try {
                // Già dentro (collegamento di Google a un account esistente): l'identità è stata aggiunta, non serve una nuova sessione.
                const already = linking ? await account.get().then(() => true).catch(() => false) : false;
                if (!already && userId && secret) {
                    try {
                        await account.createSession({ userId, secret });
                    } catch (err) {
                        if ((err as { type?: string })?.type !== 'user_session_already_exists') throw err;
                        await account.deleteSession({ sessionId: 'current' });
                        await account.createSession({ userId, secret });
                    }
                }
                const state = await reloadSession();
                if (state === 'mfa') {
                    navigate('/login', { replace: true, state: { mfa: true, from: { pathname: pending.returnTo } } });
                    return;
                }
                if (state === 'incomplete') {
                    navigate('/completa-account', { replace: true, state: { choice: pending.choice, returnTo: pending.returnTo } });
                    return;
                }
                if (state !== 'ok') throw new Error('session');

                if (pending.intent === 'calendar' && pending.events?.length) {
                    const token = await calendarToken();
                    if (!token) {
                        showToast('Google non ha concesso l’accesso al calendario: puoi riprovare o scaricare il file del calendario.', 'info');
                    } else {
                        try {
                            await insertCalendarEvents(token, pending.events);
                            showToast(pending.events.length === 1 ? 'Aggiunto al tuo Google Calendar.' : `${pending.events.length} appuntamenti aggiunti al tuo Google Calendar.`, 'success');
                        } catch (err) {
                            console.error('Google Calendar:', err);
                            showToast('Google Calendar non ha accettato l’evento. Riprova tra poco.', 'error');
                        }
                    }
                } else if (pending.intent === 'link') {
                    showToast('Account Google collegato: da ora puoi accedere anche con Google.', 'success');
                } else {
                    showToast('Accesso effettuato.', 'success');
                }
                navigate(pending.returnTo, { replace: true });
            } catch (err) {
                console.error('Accesso con Google:', err);
                setError('Non è stato possibile completare l’accesso con Google. Riprova o accedi con email e password.');
            }
        })();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <AuthLayout aside={{ title: 'Quasi fatto.', text: 'Stiamo aprendo il tuo account SwimIn.' }}>
            <div className="w-full bg-white lg:rounded-3xl lg:shadow-lift lg:border lg:border-slate-100 lg:p-8 text-center" aria-live="polite">
                {error ? (
                    <>
                        <Icon type="alert-triangle" className="w-10 h-10 mx-auto text-galleggiante-700 mb-3" />
                        <h1 className="text-2xl font-bold text-abisso">Accesso con Google non riuscito</h1>
                        <p className="text-slate-600 mt-2">{error}</p>
                        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
                            <Link to="/login" className="px-5 py-2.5 rounded-full font-semibold bg-corsia-600 text-white hover:bg-corsia-700">Torna all’accesso</Link>
                            <Link to="/" className="px-5 py-2.5 rounded-full font-semibold text-slate-700 hover:bg-slate-100">Vai alla home</Link>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="w-10 h-10 mx-auto border-4 border-corsia-100 border-t-corsia-600 rounded-full animate-spin mb-4" aria-hidden="true" />
                        <h1 className="text-2xl font-bold text-abisso">Accesso con Google…</h1>
                        <p className="text-slate-600 mt-2">Un attimo, stiamo aprendo il tuo account.</p>
                    </>
                )}
            </div>
        </AuthLayout>
    );
};

export default GoogleCallback;
