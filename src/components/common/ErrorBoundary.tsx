import React from 'react';
import { reportClientError } from './ErrorReporter';
import { isChunkError } from '@/utils/lazyPage';

interface ErrorBoundaryState {
    error: Error | null;
}

/**
 * Intercetta gli errori di rendering e mostra una schermata di recupero
 * invece della pagina bianca. Un errore di caricamento di un chunk (tipico
 * dopo un nuovo deploy con la scheda aperta) si risolve ricaricando.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
    state: ErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('Errore non gestito nell\'interfaccia:', error, info.componentStack);
        reportClientError(error, info.componentStack || '');
    }

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;

        const chunkError = isChunkError(error);

        return (
            <div className="min-h-[60vh] flex items-center justify-center p-6">
                <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl shadow-sm p-8 text-center">
                    <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-2xl" aria-hidden="true">
                        🌊
                    </div>
                    <h1 className="text-xl font-bold text-abisso mb-2">
                        {chunkError ? 'È disponibile una nuova versione' : 'Qualcosa è andato storto'}
                    </h1>
                    <p className="text-slate-600 mb-6">
                        {chunkError
                            ? 'Abbiamo aggiornato SwimIn mentre navigavi. Ricarica la pagina per continuare.'
                            : 'Si è verificato un errore imprevisto. Ricarica la pagina; se il problema continua, contattaci.'}
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <button
                            onClick={() => window.location.reload()}
                            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-full transition outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                        >
                            Ricarica la pagina
                        </button>
                        <a
                            href="/"
                            className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-full transition outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                        >
                            Torna alla home
                        </a>
                    </div>
                </div>
            </div>
        );
    }
}
