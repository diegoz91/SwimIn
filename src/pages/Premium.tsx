import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/context/ToastContext';
import { databaseService, type BillingStatus } from '@/services/database';
import { Icon } from '@/components/ui/Icon';
import { PageLoader } from '@/components/common/PageLoader';
import { PremiumBadge } from '@/features/premium/PremiumBadge';
import { PLAN_FEATURES, euro } from '@/utils/premium';
import { formatDate } from '@/utils/dates';

const SOURCE: Record<string, string> = { trial: 'prova gratuita', stripe: 'carta', paypal: 'PayPal', admin: 'omaggio SwimIn' };

/** SwimIn Premium: confronto dei piani, prova gratuita, abbonamento e gestione. */
const Premium: React.FC = () => {
    usePageTitle('SwimIn Premium');
    const { refreshProfile } = useAuth();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const [status, setStatus] = useState<BillingStatus | null>(null);
    const [period, setPeriod] = useState<'month' | 'year'>('year');
    const [busy, setBusy] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            setStatus(await databaseService.getBillingStatus());
        } catch (err) {
            console.error('Premium:', err);
            showToast(err instanceof Error ? err.message : 'Impossibile caricare i piani.', 'error');
        }
    }, [showToast]);

    useEffect(() => { void load(); }, [load]);

    // Ritorno dalle pagine di pagamento.
    useEffect(() => {
        const esito = params.get('esito');
        if (!esito) return;
        const clear = () => setParams({}, { replace: true });
        if (esito === 'annullato') {
            showToast('Pagamento annullato: non ti è stato addebitato nulla.', 'info');
            clear();
            return;
        }
        if (esito === 'paypal') {
            const id = params.get('subscription_id');
            if (!id) { clear(); return; }
            setBusy('paypal');
            databaseService
                .confirmPaypal(id)
                .then(async (r) => {
                    showToast(r.status === 'active' ? 'Abbonamento PayPal attivo: benvenuto in Premium!' : 'Pagamento ricevuto: l’attivazione richiede qualche minuto.', 'success');
                    await Promise.all([load(), refreshProfile()]);
                })
                .catch((err) => showToast(err instanceof Error ? err.message : 'Conferma non riuscita.', 'error'))
                .finally(() => { setBusy(null); clear(); });
            return;
        }
        if (esito === 'ok') {
            // Il webhook di Stripe arriva in pochi secondi: ricontrolliamo qualche volta.
            showToast('Pagamento completato: stiamo attivando Premium…', 'success');
            let tries = 0;
            const tick = window.setInterval(async () => {
                tries++;
                const s = await databaseService.getBillingStatus().catch(() => null);
                if (s) setStatus(s);
                if ((s?.subscription && s.subscription.status === 'active') || tries >= 8) {
                    window.clearInterval(tick);
                    await refreshProfile().catch((err) => console.warn('Profilo:', err));
                }
            }, 2500);
            clear();
            return () => window.clearInterval(tick);
        }
    }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

    const startTrial = async () => {
        setBusy('trial');
        try {
            await databaseService.startTrial();
            await Promise.all([load(), refreshProfile()]);
            showToast('Prova gratuita attiva: hai 30 giorni per provare tutto.', 'success');
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Attivazione non riuscita.', 'error');
        } finally {
            setBusy(null);
        }
    };

    const checkout = async (provider: 'stripe' | 'paypal') => {
        setBusy(provider);
        try {
            const { url } = await databaseService.createCheckout(provider, period);
            window.location.assign(url);
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Pagamento non disponibile.', 'error');
            setBusy(null);
        }
    };

    const manage = async (cancel = false) => {
        if (cancel && !window.confirm('Disdire il rinnovo? Premium resta attivo fino alla fine del periodo già pagato.')) return;
        setBusy('manage');
        try {
            const res = await databaseService.manageSubscription(cancel);
            if (res.url) window.location.assign(res.url);
            else {
                showToast('Rinnovo disdetto: Premium resta attivo fino alla scadenza.', 'info');
                await load();
            }
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Operazione non riuscita.', 'error');
        } finally {
            setBusy(null);
        }
    };

    if (!status) return <PageLoader />;
    const features = PLAN_FEATURES[status.audience];
    const price = status.prices[period];
    const monthlyEquivalent = period === 'year' ? Math.round(status.prices.year / 12) : status.prices.month;
    const saving = Math.round((1 - status.prices.year / (status.prices.month * 12)) * 100);
    const sub = status.subscription;
    const renewing = sub && ['active', 'trialing', 'past_due'].includes(sub.status) && !sub.cancelAtPeriodEnd;
    const canPay = status.providers.stripe || status.providers.paypal;

    return (
        <div className="pt-4 pb-10 max-w-5xl mx-auto w-full">
            <section className="relative overflow-hidden rounded-3xl bg-abisso text-white px-6 sm:px-10 py-10 mb-6">
                <div className="absolute inset-x-0 bottom-0 lane-rope opacity-60" aria-hidden="true" />
                <div className="flex items-center gap-3">
                    <PremiumBadge size="md" />
                    <span className="font-semibold text-oro-300">SwimIn Premium</span>
                </div>
                <h1 className="text-4xl sm:text-5xl font-bold mt-4 leading-[1.05] max-w-2xl">
                    {status.audience === 'structure' ? 'Trova personale prima degli altri.' : 'Fatti trovare dalle piscine giuste.'}
                </h1>
                <p className="text-white/80 mt-3 max-w-xl">
                    {status.audience === 'structure'
                        ? 'Annunci senza limiti e in evidenza, ricerca avanzata dei professionisti disponibili, messaggi diretti e statistiche della pagina.'
                        : 'Candidature in cima alla lista, messaggi diretti, tutte le visite al profilo, statistiche e visite anonime.'}
                </p>
            </section>

            {status.premium && (
                <section className="mb-6 rounded-2xl border border-oro-300 bg-oro-50 p-5 flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <p className="font-semibold text-abisso flex items-center gap-2"><PremiumBadge /> Sei Premium</p>
                        <p className="text-sm text-slate-700 mt-1">
                            {renewing
                                ? `Si rinnova il ${formatDate(sub!.currentPeriodEnd.slice(0, 10), 'short')} (${sub!.period === 'year' ? 'annuale' : 'mensile'}, ${SOURCE[sub!.provider]}).`
                                : `Attivo fino al ${formatDate((status.premiumUntil || '').slice(0, 10), 'short')}${status.source ? ` (${SOURCE[status.source] || status.source})` : ''}.`}
                            {status.inmailCredits > 0 && ` Messaggi diretti disponibili: ${status.inmailCredits}.`}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {sub?.provider === 'stripe' && (
                            <button onClick={() => manage()} disabled={busy === 'manage'} className="px-4 py-2 rounded-full text-sm font-semibold bg-white border border-oro-300 text-abisso hover:bg-oro-100 disabled:opacity-60">
                                Gestisci abbonamento e fatture
                            </button>
                        )}
                        {sub?.provider === 'paypal' && renewing && (
                            <button onClick={() => manage(true)} disabled={busy === 'manage'} className="px-4 py-2 rounded-full text-sm font-semibold bg-white border border-oro-300 text-abisso hover:bg-oro-100 disabled:opacity-60">
                                Disdici il rinnovo
                            </button>
                        )}
                        <button onClick={() => navigate('/profile')} className="px-4 py-2 rounded-full text-sm font-semibold bg-abisso text-white hover:bg-corsia-900">Vai alle statistiche</button>
                    </div>
                </section>
            )}

            {!renewing && (
                <div className="flex justify-center mb-5">
                    <div className="inline-flex bg-white border border-slate-200 rounded-full p-1" role="radiogroup" aria-label="Durata dell'abbonamento">
                        {(['month', 'year'] as const).map((p) => (
                            <button
                                key={p}
                                role="radio"
                                aria-checked={period === p}
                                onClick={() => setPeriod(p)}
                                className={`px-5 py-2 rounded-full text-sm font-semibold transition-colors ${period === p ? 'bg-abisso text-white' : 'text-slate-600 hover:text-abisso'}`}
                            >
                                {p === 'month' ? 'Mensile' : `Annuale · risparmi ${saving}%`}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid md:grid-cols-2 gap-4">
                <section className="rounded-2xl border border-slate-200 bg-white p-6 flex flex-col">
                    <h2 className="text-2xl font-bold text-abisso">Base</h2>
                    <p className="text-3xl font-bold text-abisso mt-2">Gratis</p>
                    <p className="text-sm text-slate-500">Per sempre</p>
                    <ul className="mt-5 space-y-3 flex-1">
                        {features.map((f) => (
                            <li key={f.label} className="flex items-start gap-3 text-sm">
                                <FeatureMark value={f.base} />
                                <span className={f.base ? 'text-slate-800' : 'text-slate-400'}>
                                    {f.label}
                                    {typeof f.base === 'string' && <span className="block text-xs text-slate-500">{f.base}</span>}
                                </span>
                            </li>
                        ))}
                    </ul>
                    {!status.premium && <p className="mt-6 text-sm font-semibold text-slate-500 text-center">Il tuo piano attuale</p>}
                </section>

                <section className="rounded-2xl border-2 border-oro-500 bg-white p-6 flex flex-col shadow-lift relative">
                    <span className="absolute -top-3 left-6 bg-oro-500 text-white text-xs font-semibold px-3 py-1 rounded-full">Consigliato</span>
                    <h2 className="text-2xl font-bold text-abisso flex items-center gap-2">Premium <PremiumBadge /></h2>
                    <p className="text-3xl font-bold text-abisso mt-2">
                        {euro(price)} <span className="text-base font-semibold text-slate-500">/ {period === 'month' ? 'mese' : 'anno'}</span>
                    </p>
                    <p className="text-sm text-slate-500">
                        {period === 'year' ? `Pari a ${euro(monthlyEquivalent)} al mese` : 'Disdici quando vuoi'} · IVA inclusa
                    </p>
                    <ul className="mt-5 space-y-3 flex-1">
                        {features.map((f) => (
                            <li key={f.label} className="flex items-start gap-3 text-sm">
                                <FeatureMark value={f.premium} premium />
                                <span className="text-slate-800">
                                    {f.label}
                                    {typeof f.premium === 'string' && <span className="block text-xs text-oro-700 font-semibold">{f.premium}</span>}
                                </span>
                            </li>
                        ))}
                    </ul>

                    {!renewing && (
                        <div className="mt-6 space-y-2">
                            {status.trialAvailable && (
                                <button onClick={startTrial} disabled={!!busy} className="w-full px-5 py-3 rounded-full font-semibold bg-oro-500 text-white hover:bg-oro-600 disabled:opacity-60">
                                    {busy === 'trial' ? 'Attivazione…' : `Prova gratis per ${status.trialDays} giorni`}
                                </button>
                            )}
                            {status.trialAvailable && canPay && <p className="text-xs text-slate-500 text-center">Nessuna carta richiesta per la prova. Oppure abbonati subito:</p>}
                            {status.providers.stripe && (
                                <button onClick={() => checkout('stripe')} disabled={!!busy} className="w-full px-5 py-3 rounded-full font-semibold bg-abisso text-white hover:bg-corsia-900 disabled:opacity-60 inline-flex items-center justify-center gap-2">
                                    <Icon type="lock-closed" className="w-4 h-4" /> {busy === 'stripe' ? 'Apertura del pagamento…' : 'Paga con carta, Apple Pay o Google Pay'}
                                </button>
                            )}
                            {status.providers.paypal && (
                                <button onClick={() => checkout('paypal')} disabled={!!busy} className="w-full px-5 py-3 rounded-full font-semibold bg-[#FFC439] text-[#111827] hover:brightness-95 disabled:opacity-60">
                                    {busy === 'paypal' ? 'Apertura di PayPal…' : 'Paga con PayPal'}
                                </button>
                            )}
                            {!canPay && !status.trialAvailable && !status.premium && (
                                <p className="text-sm text-slate-600 text-center">I pagamenti online arrivano a breve. Scrivici per attivare Premium.</p>
                            )}
                            {status.premium && canPay && <p className="text-xs text-slate-500 text-center">Se ti abboni ora, il primo addebito parte alla fine del periodo in corso.</p>}
                        </div>
                    )}
                </section>
            </div>

            <dl className="mt-8 grid sm:grid-cols-3 gap-4 text-sm">
                <div className="rounded-2xl bg-white border border-slate-200 p-4">
                    <dt className="font-semibold text-abisso">Disdici quando vuoi</dt>
                    <dd className="text-slate-600 mt-1">Il rinnovo si ferma subito; Premium resta attivo fino alla fine del periodo pagato.</dd>
                </div>
                <div className="rounded-2xl bg-white border border-slate-200 p-4">
                    <dt className="font-semibold text-abisso">Pagamenti sicuri</dt>
                    <dd className="text-slate-600 mt-1">Gestiti da Stripe e PayPal: SwimIn non vede né conserva i dati della carta.</dd>
                </div>
                <div className="rounded-2xl bg-white border border-slate-200 p-4">
                    <dt className="font-semibold text-abisso">Fatture e ricevute</dt>
                    <dd className="text-slate-600 mt-1">Le trovi nell’area di gestione dell’abbonamento, scaricabili in PDF.</dd>
                </div>
            </dl>
        </div>
    );
};

const FeatureMark: React.FC<{ value: string | boolean; premium?: boolean }> = ({ value, premium }) =>
    value ? (
        <span className={`mt-0.5 w-5 h-5 rounded-full grid place-items-center flex-shrink-0 ${premium ? 'bg-oro-100 text-oro-700' : 'bg-corsia-50 text-corsia-700'}`}>
            <Icon type="check" className="w-3.5 h-3.5" />
        </span>
    ) : (
        <span className="mt-0.5 w-5 h-5 rounded-full grid place-items-center flex-shrink-0 bg-slate-100 text-slate-400">
            <Icon type="x" className="w-3 h-3" />
        </span>
    );

export default Premium;
