import React from 'react';
import { Link } from 'react-router';
import { Brand } from '@/components/ui/Brand';
import { Icon, type IconType } from '@/components/ui/Icon';
import { PoolLanes } from '@/components/marketing/PoolLanes';
import { usePageTitle } from '@/hooks/usePageTitle';

const FOR_PROFESSIONALS: { icon: IconType; title: string; text: string }[] = [
    { icon: 'certificate', title: 'Brevetti sempre in regola', text: 'Inserisci brevetti e certificazioni con la scadenza: SwimIn ti avvisa prima che scadano.' },
    { icon: 'star', title: 'Competenze confermate dai colleghi', text: 'Scuola nuoto, salvamento, BLSD: chi ha lavorato con te può confermarle sul tuo profilo.' },
    { icon: 'alert-triangle', title: 'Sostituzioni urgenti', text: 'Attiva la disponibilità e ricevi le richieste SOS delle piscine della tua zona.' },
    { icon: 'document', title: 'Il tuo passaporto in PDF', text: 'Un curriculum natatorio pronto da inviare, generato dal tuo profilo.' },
];

const FOR_SWIMMERS: { icon: IconType; title: string; text: string }[] = [
    { icon: 'building', title: 'Piscine con recensioni vere', text: 'Acqua, spogliatoi, corsi e istruttori raccontati da chi ci nuota davvero.' },
    { icon: 'users', title: 'La tua community', text: 'Compagni di corsia, gruppo master, istruttori: resta in contatto anche fuori dall’acqua.' },
    { icon: 'heart', title: 'Racconta il tuo nuoto', text: 'Allenamenti, gare, traguardi e pensieri: condividili con chi capisce cosa vuol dire.' },
    { icon: 'location', title: 'Swim-Meet vicino a te', text: 'Allenamenti condivisi, uscite in acque libere e ritrovi organizzati dalla community.' },
];

const FOR_FACILITIES: { icon: IconType; title: string; text: string }[] = [
    { icon: 'briefcase', title: 'Annunci mirati', text: 'Pubblica posizioni con i brevetti richiesti e vedi subito l’affinità di ogni candidato.' },
    { icon: 'users', title: 'Staff e turni', text: 'Bacheca interna, turni e comunicazioni importanti per il tuo team, in un posto solo.' },
    { icon: 'bell', title: 'SOS Vasca', text: 'Un bagnino si ammala? Lancia una richiesta urgente ai professionisti disponibili vicino a te.' },
    { icon: 'building', title: 'La pagina della tua piscina', text: 'Vasche, corsi e posizioni aperte: fatti trovare da chi cerca lavoro e da chi vuole seguirti.' },
];

const FeatureList: React.FC<{ items: typeof FOR_PROFESSIONALS }> = ({ items }) => (
    <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-7">
        {items.map((f) => (
            <li key={f.title} className="flex gap-4">
                <span className="w-11 h-11 rounded-xl bg-corsia-50 text-corsia-700 flex items-center justify-center shrink-0">
                    <Icon type={f.icon} className="w-6 h-6" />
                </span>
                <span>
                    <span className="block font-semibold text-abisso">{f.title}</span>
                    <span className="block text-slate-600 mt-1 leading-relaxed">{f.text}</span>
                </span>
            </li>
        ))}
    </ul>
);

/** Pagina pubblica per chi non ha ancora effettuato l'accesso. */
const Landing: React.FC = () => {
    usePageTitle(null);

    return (
        <div className="w-full">
            <header className="max-w-6xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
                <Brand size="md" />
                <nav className="flex items-center gap-2 sm:gap-3">
                    <Link to="/login" className="px-4 py-2 text-sm font-semibold text-abisso hover:text-corsia-700 rounded-full">
                        Accedi
                    </Link>
                    <Link to="/register" className="px-4 sm:px-5 py-2.5 text-sm font-semibold text-white bg-corsia-600 hover:bg-corsia-700 rounded-full">
                        Iscriviti
                    </Link>
                </nav>
            </header>

            <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-16 sm:pt-12 sm:pb-24 grid lg:grid-cols-[1.05fr_1fr] gap-12 items-center">
                <div>
                    <h1 className="text-[2.75rem] leading-[0.95] sm:text-6xl lg:text-7xl font-bold text-abisso">
                        La community di chi vive il nuoto.
                    </h1>
                    <p className="mt-6 text-lg sm:text-xl text-slate-600 max-w-xl leading-relaxed">
                        Chi ci lavora, chi ci nuota e le piscine, nello stesso posto: offerte e sostituzioni per i professionisti,
                        recensioni, corsi e community per chi nuota per passione.
                    </p>
                    <div className="mt-8 flex flex-col sm:flex-row gap-3">
                        <Link to="/register" className="inline-flex justify-center px-7 py-3.5 font-semibold text-white bg-corsia-600 hover:bg-corsia-700 rounded-full shadow-card">
                            Crea il tuo profilo gratis
                        </Link>
                        <Link to="/register?tipo=passione" className="inline-flex justify-center px-7 py-3.5 font-semibold text-corsia-700 bg-white border border-corsia-200 hover:border-corsia-400 rounded-full">
                            Nuoto per passione
                        </Link>
                    </div>
                    <p className="mt-4 text-sm text-slate-500">
                        Gestisci una piscina? <Link to="/register?tipo=struttura" className="font-semibold text-corsia-700 hover:underline">Registra la struttura</Link>
                        {' · '}Hai già un account? <Link to="/login" className="font-semibold text-corsia-700 hover:underline">Accedi</Link>
                    </p>
                </div>
                <PoolLanes />
            </section>

            <section className="bg-white border-y border-slate-200/70">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20 grid lg:grid-cols-[0.8fr_1.2fr] gap-10">
                    <div>
                        <h2 className="text-4xl sm:text-5xl font-bold text-abisso leading-none">Per chi lavora in acqua</h2>
                        <p className="mt-4 text-slate-600 leading-relaxed max-w-sm">
                            Un profilo pensato per il nuoto, non un curriculum generico: brevetti, scadenze, specialità e disponibilità.
                        </p>
                    </div>
                    <FeatureList items={FOR_PROFESSIONALS} />
                </div>
            </section>

            <section>
                <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20 grid lg:grid-cols-[0.8fr_1.2fr] gap-10">
                    <div>
                        <h2 className="text-4xl sm:text-5xl font-bold text-abisso leading-none">Per chi nuota per passione</h2>
                        <p className="mt-4 text-slate-600 leading-relaxed max-w-sm">
                            Allievi dei corsi, master, triatleti, genitori a bordo vasca: trova la piscina giusta e la tua gente.
                        </p>
                    </div>
                    <FeatureList items={FOR_SWIMMERS} />
                </div>
            </section>

            <section className="bg-white border-y border-slate-200/70">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20 grid lg:grid-cols-[0.8fr_1.2fr] gap-10">
                    <div>
                        <h2 className="text-4xl sm:text-5xl font-bold text-abisso leading-none">Per piscine e centri sportivi</h2>
                        <p className="mt-4 text-slate-600 leading-relaxed max-w-sm">
                            Trova personale qualificato, gestisci lo staff e copri i turni scoperti senza giri di telefonate.
                        </p>
                    </div>
                    <FeatureList items={FOR_FACILITIES} />
                </div>
            </section>

            <section className="bg-abisso text-white">
                <div className="lane-rope" aria-hidden="true" />
                <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20 flex flex-col md:flex-row md:items-center justify-between gap-8">
                    <div>
                        <h2 className="text-4xl sm:text-5xl font-bold leading-none">Tuffati.</h2>
                        <p className="mt-3 text-corsia-100 text-lg max-w-md">Bastano due minuti per creare il profilo. È gratuito per tutti.</p>
                    </div>
                    <Link to="/register" className="inline-flex justify-center px-8 py-4 font-semibold text-abisso bg-white hover:bg-cloro-50 rounded-full shrink-0">
                        Crea il tuo profilo
                    </Link>
                </div>
            </section>

            <footer className="bg-abisso border-t border-white/10">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row gap-4 items-center justify-between text-sm text-corsia-200">
                    <Brand size="sm" inverted />
                    <nav className="flex gap-6" aria-label="Documenti legali">
                        <Link to="/privacy" className="hover:text-white">Privacy</Link>
                        <Link to="/termini" className="hover:text-white">Termini</Link>
                        <Link to="/cookie" className="hover:text-white">Cookie</Link>
                    </nav>
                    <span>© {new Date().getFullYear()} SwimIn</span>
                </div>
            </footer>
        </div>
    );
};

export default Landing;
