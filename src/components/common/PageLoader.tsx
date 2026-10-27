import React from 'react';
import { useTopProgress } from './TopProgress';

type Variant = 'page' | 'list' | 'detail' | 'calendar';

const Bar: React.FC<{ className?: string }> = ({ className = '' }) => <div className={`rounded-full bg-slate-200/80 ${className}`} />;
const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
    <div className={`bg-white rounded-2xl border border-slate-200 p-5 ${className}`}>{children}</div>
);

/**
 * Caricamento di una pagina: barra di avanzamento in cima e uno scheletro con la forma della
 * pagina, così quando arrivano i dati il contenuto non "salta". Le forme: elenco (default),
 * dettaglio (annuncio, evento) e calendario (turni).
 */
export const PageLoader: React.FC<{ label?: string; variant?: Variant }> = ({ label = 'Caricamento…', variant = 'page' }) => {
    useTopProgress();
    return (
        <div className="flex-1 w-full pt-4 motion-safe:animate-pulse" role="status" aria-live="polite" aria-busy="true">
            <span className="sr-only">{label}</span>
            <div className="max-w-5xl mx-auto w-full" aria-hidden="true">
                <Bar className="h-9 w-56 mb-3" />
                <Bar className="h-4 w-72 max-w-full mb-6" />
                {variant === 'calendar' ? (
                    <Card>
                        <div className="flex justify-between mb-4"><Bar className="h-8 w-40" /><Bar className="h-5 w-32" /></div>
                        <div className="grid grid-cols-7 gap-2">
                            {Array.from({ length: 21 }, (_, i) => <div key={i} className="h-16 rounded-xl bg-slate-100" />)}
                        </div>
                    </Card>
                ) : variant === 'detail' ? (
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
                        <Card className="space-y-3">
                            <Bar className="h-6 w-2/3" />
                            <Bar className="h-4 w-1/3" />
                            <div className="pt-3 space-y-2"><Bar className="h-3" /><Bar className="h-3" /><Bar className="h-3 w-5/6" /><Bar className="h-3 w-2/3" /></div>
                        </Card>
                        <Card className="space-y-3"><Bar className="h-10" /><Bar className="h-4 w-3/4" /><Bar className="h-4 w-1/2" /></Card>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {[0, 1, 2].map((i) => (
                            <Card key={i} className="flex gap-4 items-center">
                                <div className="w-12 h-12 rounded-xl bg-slate-200/80 shrink-0" />
                                <div className="flex-1 space-y-2"><Bar className="h-4 w-1/2" /><Bar className="h-3 w-1/3" /></div>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
