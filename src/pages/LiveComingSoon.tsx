import React from 'react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Icon } from '@/components/ui/Icon';

/** Le dirette arrivano dopo il lancio: intanto una pagina che spiega cosa saranno e dove andare. */
const LiveComingSoon: React.FC = () => {
    usePageTitle('Live');
    return (
        <div className="pt-6 max-w-2xl mx-auto w-full">
            <section className="bg-white rounded-3xl border border-slate-200 shadow-card overflow-hidden" aria-labelledby="live-soon">
                <div className="lane-rope h-1.5" aria-hidden="true" />
                <div className="p-6 sm:p-10 text-center">
                    <span className="mx-auto w-14 h-14 rounded-2xl bg-corsia-50 text-corsia-700 grid place-items-center mb-4" aria-hidden="true">
                        <Icon type="video" className="w-7 h-7" />
                    </span>
                    <h1 id="live-soon" className="text-3xl font-bold text-abisso">Le dirette arrivano presto</h1>
                    <p className="text-slate-600 mt-3 max-w-md mx-auto">
                        Corsi sulla sicurezza in acqua, lezioni di acquagym e aggiornamenti per istruttori in diretta, dal telefono o con OBS e Prism. Ti avvisiamo quando sono pronte.
                    </p>
                    <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
                        <Link to="/eventi" className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-corsia-600 text-white font-semibold hover:bg-corsia-700">
                            <Icon type="calendar" className="w-5 h-5" /> Vedi eventi e corsi
                        </Link>
                        <Link to="/gruppi" className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full border border-slate-300 text-abisso font-semibold hover:bg-slate-50">
                            <Icon type="users" className="w-5 h-5" /> Entra in un gruppo
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default LiveComingSoon;
