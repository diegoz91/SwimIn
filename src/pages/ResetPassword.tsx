import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { account } from '@/services/appwrite';
import { useToast } from '@/context/ToastContext';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Pagina raggiunta dal link "Password dimenticata?" inviato per email.
 * Appwrite aggiunge all'URL i parametri `userId` e `secret`.
 */
const ResetPassword: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const userId = params.get('userId');
  const secret = params.get('secret');
  const linkIsValid = !!userId && !!secret;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`La password deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri.`);
      return;
    }
    if (password !== confirm) {
      setError('Le due password non coincidono.');
      return;
    }
    setIsLoading(true);
    try {
      await account.updateRecovery(userId!, secret!, password);
      showToast('Password aggiornata. Ora puoi accedere.', 'success');
      navigate('/login', { replace: true });
    } catch (err) {
      console.error('updateRecovery:', err);
      setError('Il link non è valido o è scaduto. Richiedine uno nuovo dalla pagina di accesso.');
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass =
    'w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none bg-slate-50 focus:bg-white';

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-slate-50">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-100 p-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Imposta una nuova password</h1>

        {!linkIsValid ? (
          <p className="text-slate-600">
            Il link non è completo. Apri di nuovo il link ricevuto via email oppure{' '}
            <Link to="/login" className="text-blue-600 font-semibold hover:underline">
              richiedine uno nuovo
            </Link>
            .
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div>
              <label htmlFor="new-password" className="block text-sm font-semibold text-slate-700 mb-1">
                Nuova password
              </label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                disabled={isLoading}
                required
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-semibold text-slate-700 mb-1">
                Conferma password
              </label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={inputClass}
                disabled={isLoading}
                required
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-4 rounded-xl transition-all shadow-md disabled:opacity-70 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              {isLoading ? 'Salvataggio…' : 'Salva nuova password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
