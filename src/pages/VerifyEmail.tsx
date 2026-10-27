import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { account } from '@/services/appwrite';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { authErrorMessage } from '@/utils/authErrors';
import { Icon } from '@/components/ui/Icon';

type Status = 'verifying' | 'success' | 'error';

/** Destinazione del link di conferma email inviato da Appwrite (?userId=…&secret=…). */
const VerifyEmail: React.FC = () => {
    usePageTitle('Verifica email');
    const [params] = useSearchParams();
    const { authenticated, refreshProfile } = useAuth();
    const [status, setStatus] = useState<Status>('verifying');
    const [message, setMessage] = useState('');
    const started = useRef(false);

    useEffect(() => {
        if (started.current) return; // StrictMode monta due volte: il secret è monouso
        started.current = true;

        const userId = params.get('userId');
        const secret = params.get('secret');
        if (!userId || !secret) {
            setStatus('error');
            setMessage('Il link è incompleto. Aprilo di nuovo dall\'email ricevuta.');
            return;
        }
        account
            .updateVerification(userId, secret)
            .then(async () => {
                setStatus('success');
                if (authenticated) await refreshProfile().catch(() => undefined);
            })
            .catch((error) => {
                setStatus('error');
                setMessage(authErrorMessage(error, 'Non è stato possibile verificare l\'email.'));
            });
    }, [params, authenticated, refreshProfile]);

    return (
        <div className="min-h-[70vh] flex items-center justify-center px-4">
            <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-100 p-8 text-center">
                {status === 'verifying' && (
                    <>
                        <div className="w-10 h-10 mx-auto mb-4 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                        <h1 className="text-xl font-bold text-abisso">Verifica in corso…</h1>
                    </>
                )}
                {status === 'success' && (
                    <>
                        <Icon type="check-circle" className="w-12 h-12 mx-auto mb-3 text-cloro-600" />
                        <h1 className="text-xl font-bold text-abisso mb-2">Email verificata</h1>
                        <p className="text-slate-600 mb-6">Grazie! Il tuo indirizzo è confermato.</p>
                    </>
                )}
                {status === 'error' && (
                    <>
                        <Icon type="alert-triangle" className="w-12 h-12 mx-auto mb-3 text-amber-500" />
                        <h1 className="text-xl font-bold text-abisso mb-2">Verifica non riuscita</h1>
                        <p className="text-slate-600 mb-6">{message} Puoi richiedere un nuovo link dalle Impostazioni.</p>
                    </>
                )}
                {status !== 'verifying' && (
                    <Link
                        to={authenticated ? '/' : '/login'}
                        className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-full transition"
                    >
                        {authenticated ? 'Vai al feed' : 'Accedi'}
                    </Link>
                )}
            </div>
        </div>
    );
};

export default VerifyEmail;
