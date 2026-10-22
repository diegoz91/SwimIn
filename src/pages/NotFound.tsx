import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';

const NotFound: React.FC = () => {
    const { authenticated } = useAuth();
    usePageTitle('Pagina non trovata');

    return (
        <div className="min-h-[60vh] flex items-center justify-center p-6">
            <div className="text-center max-w-md">
                <p className="text-7xl font-black text-blue-600/20 tracking-tight select-none" aria-hidden="true">404</p>
                <h1 className="text-2xl font-extrabold text-slate-900 mt-2">Questa corsia è vuota</h1>
                <p className="text-slate-600 mt-2 mb-8">
                    La pagina che cerchi non esiste o è stata spostata.
                </p>
                <Link
                    to={authenticated ? '/' : '/login'}
                    className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-full transition outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                >
                    {authenticated ? 'Torna al feed' : 'Vai all\'accesso'}
                </Link>
            </div>
        </div>
    );
};

export default NotFound;
