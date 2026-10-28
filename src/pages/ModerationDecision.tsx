import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { usePageTitle } from '@/hooks/usePageTitle';
import { databaseService, type ModerationDecision as Decision } from '@/services/database';
import { PageLoader } from '@/components/common/PageLoader';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { openFeedback } from '@/features/feedback/Feedback';
import { LEGAL } from '@/config/legal';

const TARGET: Record<string, string> = { post: 'post', comment: 'commento', job: 'annuncio', review: 'recensione', profile: 'profilo' };

/** Motivazione di un provvedimento ricevuto (Digital Services Act art. 17) e come contestarlo. */
const ModerationDecision: React.FC = () => {
    usePageTitle('Motivazione della decisione');
    const { id = '' } = useParams();
    const [d, setD] = useState<Decision | null | undefined>(undefined);
    useEffect(() => {
        let alive = true;
        databaseService.getModerationDecision(id).then((r) => alive && setD(r)).catch((err) => { console.warn('Decisione:', err); if (alive) setD(null); });
        return () => { alive = false; };
    }, [id]);

    if (d === undefined) return <PageLoader variant="detail" />;
    if (d === null) {
        return (
            <div className="pt-10 max-w-xl mx-auto w-full text-center">
                <h1 className="text-3xl font-bold text-abisso">Decisione non trovata</h1>
                <p className="text-slate-600 mt-2">Il link non è valido oppure la decisione non riguarda il tuo account.</p>
                <Button to="/notifiche" className="mt-5">Vai alle notifiche</Button>
            </div>
        );
    }
    const suspended = d.action === 'suspend';
    return (
        <div className="pt-4 pb-10 max-w-2xl mx-auto w-full">
            <Link to="/notifiche" className="inline-flex items-center gap-1.5 py-1 -my-1 text-sm font-semibold text-corsia-700 hover:underline">
                <Icon type="arrow-left" className="w-4 h-4" /> Notifiche
            </Link>
            <h1 className="mt-3 text-3xl font-bold text-abisso">{suspended ? 'Il tuo account è stato sospeso' : `Abbiamo rimosso un tuo ${TARGET[d.targetType] || 'contenuto'}`}</h1>
            <p className="text-slate-500 mt-1">Decisione del {new Date(d.decidedAt).toLocaleString('it-IT', { dateStyle: 'long', timeStyle: 'short' })}</p>

            <section className="mt-6 bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4" aria-labelledby="decision-why">
                <h2 id="decision-why" className="text-xl font-bold text-abisso">Perché</h2>
                <dl className="space-y-3 text-sm">
                    <div>
                        <dt className="text-slate-500">Regola violata (Termini di servizio)</dt>
                        <dd className="font-semibold text-abisso">{d.groundLabel}</dd>
                    </div>
                    {d.excerpt && (
                        <div>
                            <dt className="text-slate-500">Contenuto interessato</dt>
                            <dd><blockquote className="mt-1 border-l-4 border-slate-200 pl-3 text-slate-700 break-words">{d.excerpt}</blockquote></dd>
                        </div>
                    )}
                    {d.explanation && (
                        <div>
                            <dt className="text-slate-500">Motivazione</dt>
                            <dd className="text-slate-700 break-words">{d.explanation}</dd>
                        </div>
                    )}
                    <div>
                        <dt className="text-slate-500">Come è stata presa</dt>
                        <dd className="text-slate-700">Da una persona dello staff dopo una segnalazione, non da un sistema automatico.</dd>
                    </div>
                </dl>
            </section>

            <section className="mt-5 bg-white rounded-2xl border border-slate-200 p-5 sm:p-6" aria-labelledby="decision-contest">
                <h2 id="decision-contest" className="text-xl font-bold text-abisso">Pensi che sia un errore?</h2>
                <p className="text-sm text-slate-600 mt-2">
                    Scrivici spiegando perché: riesaminiamo la decisione e ti rispondiamo. Puoi anche scrivere a {LEGAL.contactEmail}, rivolgerti a un
                    organismo di risoluzione extragiudiziale delle controversie o all’autorità giudiziaria.
                </p>
                <Button className="mt-4" onClick={() => openFeedback('problema')}>Contesta la decisione</Button>
            </section>
        </div>
    );
};

export default ModerationDecision;
