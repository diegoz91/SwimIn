import React from 'react';
import { Link } from 'react-router-dom';
import { Brand } from '@/components/ui/Brand';
import { PublicFooter } from '@/components/layout/PublicFooter';

interface AuthLayoutProps {
    children: React.ReactNode;
    /** Testo del pannello laterale (solo desktop). */
    aside: { title: string; text: string };
}

/**
 * Impaginazione di accesso e registrazione: a sinistra il pannello del brand
 * con la vasca vista dall'alto, a destra il modulo.
 */
export const AuthLayout: React.FC<AuthLayoutProps> = ({ children, aside }) => (
    <div className="min-h-screen w-full grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <aside className="hidden lg:flex flex-col justify-between bg-abisso text-white p-12 relative overflow-hidden">
            <Link to="/" className="relative z-10 w-fit" aria-label="SwimIn, vai alla pagina iniziale">
                <Brand size="md" inverted />
            </Link>
            {/* corsie viste dall'alto */}
            <div className="absolute inset-0 flex flex-col justify-evenly opacity-50" aria-hidden="true">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="lane-rope" />
                ))}
            </div>
            <div className="relative z-10 max-w-md bg-abisso/90 rounded-3xl p-8 -mx-2">
                <h2 className="text-5xl font-bold leading-none">{aside.title}</h2>
                <p className="mt-4 text-lg text-corsia-100 leading-relaxed">{aside.text}</p>
            </div>
            <p className="relative z-10 text-sm text-corsia-200">La rete professionale di chi lavora a bordo vasca.</p>
        </aside>

        <div className="flex flex-col items-center justify-center px-4 py-10 sm:px-8 bg-white lg:bg-piastrella">
            <Link to="/" className="lg:hidden mb-8" aria-label="SwimIn, vai alla pagina iniziale">
                <Brand size="md" />
            </Link>
            <div className="w-full max-w-md">{children}</div>
            <PublicFooter />
        </div>
    </div>
);
